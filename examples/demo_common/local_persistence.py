"""Owner-scoped local conversations and Markdown facts for the durable host."""

from __future__ import annotations

import asyncio
import base64
import copy
import hashlib
import json
import zlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from commerce_common.context import WorkingContext, exchange_starts
from commerce_common.memory import match_facts
from commerce_common.types import MemoryFact
from shopping_agent import ShoppingSessionState

from .local_files import LocalFiles
from .sessions import SessionRecord
from .storage_errors import QuotaExceeded, RecordNotFound, StorageConflict, StorageUnavailable


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _uuid(value: str) -> str:
    return str(UUID(value))


class LocalConversationStore:
    def __init__(self, files: LocalFiles):
        self.files = files
        self._lock = asyncio.Lock()

    def _directory(self, user_id: str, session_id: str) -> Path:
        return self.files.path("users", _uuid(user_id), "conversations", _uuid(session_id))

    def _checkpoint(self, user_id: str, session_id: str) -> Path:
        return self._directory(user_id, session_id) / "checkpoint.json"

    def _read(self, user_id: str, session_id: str) -> dict[str, Any]:
        checkpoint = self._checkpoint(user_id, session_id)
        if not checkpoint.parent.exists():
            raise RecordNotFound(session_id)
        directory = checkpoint.parent
        event = self.files.last_jsonl(directory / "events.jsonl")
        if not event or event.get("type") != "snapshot":
            raise StorageUnavailable("Conversation has no committed snapshot")
        document = event.get("snapshot")
        if document is None:
            document = json.loads(zlib.decompress(base64.b64decode(event["snapshot_z"])))
        if document.get("user_id") != user_id or document.get("id") != session_id:
            raise RecordNotFound(session_id)
        if self.files.read_json(checkpoint) != document:
            self.files.atomic_json(checkpoint, document)
        return document

    def _commit(self, document: dict[str, Any], *, raw: list[dict[str, Any]] = ()) -> None:
        directory = self._directory(document["user_id"], document["id"])
        transcript = directory / "transcript.jsonl"
        self.files.repair_jsonl_tail(transcript)
        existing = {entry["id"] for entry in self.files.read_jsonl(transcript)} if raw else set()
        for index, message in enumerate(raw):
            message_id = f"{document['version']}:{index}"
            if message_id not in existing:
                self.files.append_jsonl(
                    transcript, {"id": message_id, "at": _now(), "message": message}
                )
        self.files.repair_jsonl_tail(directory / "events.jsonl")
        compressed = base64.b64encode(
            zlib.compress(
                json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
                level=3,
            )
        ).decode("ascii")
        self.files.append_jsonl(
            directory / "events.jsonl", {"type": "snapshot", "snapshot_z": compressed}
        )
        self.files.atomic_json(directory / "checkpoint.json", document)

    async def _aread(self, user_id: str, session_id: str) -> dict[str, Any]:
        try:
            return await asyncio.to_thread(self._read, user_id, session_id)
        except OSError as error:
            raise StorageUnavailable("Local conversation read failed") from error

    async def _acommit(self, document: dict[str, Any], *, raw: list[dict[str, Any]] = ()) -> None:
        try:
            await asyncio.to_thread(self._commit, document, raw=raw)
        except OSError as error:
            raise StorageUnavailable("Local conversation write failed") from error

    async def append_turn_raw(
        self,
        user_id: str,
        session_id: str,
        finish_version: int,
        index: int,
        message: dict[str, Any],
    ) -> None:
        async with self._lock:
            path = self._directory(user_id, session_id) / "transcript.jsonl"
            message_id = f"{finish_version}:{index}"
            await asyncio.to_thread(self._append_raw_once, path, message_id, message)

    def _append_raw_once(self, path: Path, message_id: str, message: dict[str, Any]) -> None:
        latest = self.files.last_jsonl(path)
        if latest and latest["id"] == message_id:
            return
        self.files.append_jsonl(path, {"id": message_id, "at": _now(), "message": message})

    async def save_tool_result(
        self, user_id: str, session_id: str, tool_use_id: str, content: str
    ) -> str:
        result_id = hashlib.sha256(tool_use_id.encode()).hexdigest()[:32]
        path = self._directory(user_id, session_id) / "tool-results" / f"{result_id}.txt"
        await asyncio.to_thread(self.files.atomic_text, path, content)
        return result_id

    async def read_archive(
        self, user_id: str, session_id: str, result_id: str, query: str, offset: int
    ) -> str:
        directory = self._directory(user_id, session_id)
        if result_id:
            if result_id == "session-note":
                note = await asyncio.to_thread(self.read_session_note, user_id, session_id)
                if not note:
                    return "Session note not found."
                content = note["content"]
            elif len(result_id) != 32 or any(char not in "0123456789abcdef" for char in result_id):
                return "Invalid result id."
            else:
                path = directory / "tool-results" / f"{result_id}.txt"
                if not path.exists():
                    return "Result not found."
                content = await asyncio.to_thread(path.read_text, encoding="utf-8")
            if offset < 0 or offset > len(content):
                return "Offset is outside the saved result."
            chunk = content[offset : offset + 8000]
            next_offset = offset + len(chunk)
            return (
                f"result_id={result_id} offset={offset} total_chars={len(content)}\n"
                + chunk
                + (f"\n[more; request offset={next_offset}]" if next_offset < len(content) else "")
            )
        if not query or len(query) > 100:
            return "Supply a short query or a result id."
        async with self._lock:
            entries = await asyncio.to_thread(self.files.read_jsonl, directory / "transcript.jsonl")
        matches = []
        for entry in reversed(entries):
            body = json.dumps(entry["message"], ensure_ascii=False)
            if query.casefold() in body.casefold():
                matches.append(f"message_id={entry['id']}\n{body[:1500]}")
            if len(matches) >= 5:
                break
        return "\n\n".join(matches) or "No matching archived messages."

    async def create(self, user_id: str, request_id: str) -> dict[str, Any]:
        async with self._lock:
            user_id, request_id = _uuid(user_id), _uuid(request_id)
            parent = self.files.path("users", user_id, "conversations")
            for events in parent.glob("*/events.jsonl") if parent.exists() else ():
                row = await self._aread(user_id, events.parent.name)
                if row["create_request_id"] == request_id:
                    return self._metadata(row)
            now = _now()
            document = {
                "id": str(uuid4()),
                "user_id": user_id,
                "create_request_id": request_id,
                "title": "新对话",
                "created_at": now,
                "updated_at": now,
                "version": 1,
                "next_turn": 1,
                "running_turn": None,
                "state": ShoppingSessionState().model_dump(mode="json"),
                "messages": [],
                "context": {},
                "pending_app_events": [],
                "turns": [],
            }
            await self._acommit(document)
            return self._metadata(document)

    @staticmethod
    def _metadata(row: dict[str, Any]) -> dict[str, Any]:
        return {key: row[key] for key in ("id", "title", "created_at", "updated_at")}

    async def list(self, user_id: str, offset: int, limit: int) -> list[dict[str, Any]]:
        user_id = _uuid(user_id)
        parent = self.files.path("users", user_id, "conversations")
        async with self._lock:
            rows = (
                [
                    self._metadata(await self._aread(user_id, path.parent.name))
                    for path in parent.glob("*/events.jsonl")
                ]
                if parent.exists()
                else []
            )
        return sorted(rows, key=lambda row: (row["updated_at"], row["id"]), reverse=True)[
            offset : offset + limit
        ]

    async def load(self, user_id: str, session_id: str) -> SessionRecord[ShoppingSessionState]:
        async with self._lock:
            row = await self._aread(_uuid(user_id), _uuid(session_id))
        record = SessionRecord(
            session_id=row["id"],
            user_id=row["user_id"],
            state=ShoppingSessionState.model_validate(row["state"]),
            messages=copy.deepcopy(row["messages"]),
            pending_app_events=list(row["pending_app_events"]),
            version=row["version"],
            working_context=WorkingContext.model_validate(row["context"]),
            running_turn=row["running_turn"],
        )
        record.stored_state = record.state_document()
        record.stored_messages = len(record.messages)
        note = await asyncio.to_thread(self.read_session_note, user_id, session_id)
        record.working_context.load_note(note)
        return record

    def read_session_note(self, user_id: str, session_id: str) -> dict[str, Any] | None:
        directory = self._directory(user_id, session_id) / "session-memory"
        state = self.files.read_json(directory / "state.json")
        if not state:
            return None
        content = (directory / "revisions" / f"{state['revision']}.md").read_text(encoding="utf-8")
        return state | {"content": content}

    def session_note_source(
        self, user_id: str, session_id: str, through_message_id: str | None = None
    ) -> dict[str, Any]:
        directory = self._directory(user_id, session_id)
        entries = self.files.read_jsonl(directory / "transcript.jsonl")
        if through_message_id is not None:
            end = next(
                (
                    index + 1
                    for index, entry in enumerate(entries)
                    if entry["id"] == through_message_id
                ),
                None,
            )
            if end is None:
                raise StorageUnavailable("Session note target boundary is missing")
            entries = entries[:end]
        note = self.read_session_note(user_id, session_id)
        covered_id = note["covered_through_message_id"] if note else None
        start = (
            next(
                (index + 1 for index, entry in enumerate(entries) if entry["id"] == covered_id),
                None,
            )
            if covered_id
            else 0
        )
        if start is None:
            raise StorageUnavailable("Session note coverage boundary is missing")
        return {
            "note": note,
            "messages": entries[start:],
            "last_id": entries[-1]["id"] if entries else None,
            "covered_turns": len(exchange_starts([entry["message"] for entry in entries])),
        }

    async def session_note_source_async(
        self, user_id: str, session_id: str, through_message_id: str
    ) -> dict[str, Any]:
        async with self._lock:
            return await asyncio.to_thread(
                self.session_note_source, user_id, session_id, through_message_id
            )

    async def commit_session_note(
        self,
        user_id: str,
        session_id: str,
        *,
        source_revision: int,
        covered_through_message_id: str,
        covered_turns: int,
        content: str,
        context_tokens: int = 0,
        tool_cursor: int = 0,
    ) -> bool:
        async with self._lock:
            write = asyncio.create_task(
                asyncio.to_thread(
                    self._commit_session_note,
                    user_id,
                    session_id,
                    source_revision,
                    covered_through_message_id,
                    covered_turns,
                    content,
                    context_tokens,
                    tool_cursor,
                )
            )
            try:
                return await asyncio.shield(write)
            except asyncio.CancelledError:
                await asyncio.gather(write, return_exceptions=True)
                raise

    def _commit_session_note(
        self,
        user_id: str,
        session_id: str,
        source_revision: int,
        covered_through_message_id: str,
        covered_turns: int,
        content: str,
        context_tokens: int = 0,
        tool_cursor: int = 0,
    ) -> bool:
        directory = self._directory(user_id, session_id) / "session-memory"
        current = self.files.read_json(directory / "state.json", {})
        if current.get("revision", 0) != source_revision:
            return False
        entries = self.files.read_jsonl(self._directory(user_id, session_id) / "transcript.jsonl")
        ids = [entry["id"] for entry in entries]
        if covered_through_message_id not in ids:
            return False
        boundary = ids.index(covered_through_message_id)
        current_id = current.get("covered_through_message_id")
        if current_id in ids and boundary < ids.index(current_id):
            return False
        open_tools: set[str] = set()
        boundary_version = covered_through_message_id.split(":", 1)[0]
        for entry in entries[: boundary + 1]:
            if entry["id"].split(":", 1)[0] != boundary_version:
                continue
            blocks = entry["message"].get("content")
            for block in blocks if isinstance(blocks, list) else []:
                if block.get("type") == "tool_use":
                    open_tools.add(block["id"])
                elif block.get("type") == "tool_result":
                    open_tools.discard(block["tool_use_id"])
        if open_tools:
            return False
        revision = source_revision + 1
        self.files.atomic_text(directory / "revisions" / f"{revision}.md", content)
        state = {
            "revision": revision,
            "covered_through_message_id": covered_through_message_id,
            "covered_turns": covered_turns,
            "context_tokens": context_tokens,
            "tool_cursor": tool_cursor,
            "updated_at": _now(),
        }
        self.files.atomic_json(directory / "state.json", state)
        self.files.atomic_text(directory / "summary.md", content)
        return True

    async def save(self, record: SessionRecord[ShoppingSessionState]) -> None:
        if record.state_document() == record.stored_state:
            return
        async with self._lock:
            row = await self._aread(record.user_id, record.session_id)
            if row["version"] != record.version or row["running_turn"]:
                raise StorageConflict(record.session_id)
            row = copy.deepcopy(row)
            row["state"] = record.state.model_dump(mode="json")
            row["pending_app_events"] = list(record.pending_app_events)
            row["version"] += 1
            await self._acommit(row)
            record.version = row["version"]
            record.stored_state = record.state_document()

    async def history(
        self, user_id: str, session_id: str, before: int | None, limit: int
    ) -> list[dict[str, Any]]:
        async with self._lock:
            turns = (await self._aread(_uuid(user_id), _uuid(session_id)))["turns"]
        return [self._public_turn(t) for t in turns if before is None or t["sequence"] < before][
            -limit:
        ]

    @staticmethod
    def _public_turn(turn: dict[str, Any]) -> dict[str, Any]:
        return {
            key: turn[key]
            for key in (
                "id",
                "request_id",
                "sequence",
                "message",
                "display",
                "display_version",
                "completion",
                "status",
                "created_at",
            )
        }

    async def get_turn(self, user_id: str, session_id: str, request_id: str) -> dict[str, Any]:
        async with self._lock:
            row = await self._aread(_uuid(user_id), _uuid(session_id))
        for turn in row["turns"]:
            if turn["request_id"] == _uuid(request_id):
                return self._public_turn(turn)
        raise RecordNotFound(request_id)

    def _charge(self, user_id: str, request_id: str, user_limit: int, global_limit: int) -> None:
        day = datetime.now(UTC).date().isoformat()
        path = self.files.path("usage", f"{day}.json")
        usage = self.files.read_json(path, {"global": 0, "users": {}, "requests": {}})
        if usage.setdefault("requests", {}).get(request_id) == user_id:
            return
        count = usage["users"].get(user_id, 0)
        if count >= user_limit or usage["global"] >= global_limit:
            raise QuotaExceeded(day)
        usage["users"][user_id] = count + 1
        usage["global"] += 1
        usage["requests"][request_id] = user_id
        self.files.atomic_json(path, usage)

    async def begin(
        self,
        record: SessionRecord[ShoppingSessionState],
        request_id: str,
        message: str,
        page: dict[str, Any],
        raw_user: dict[str, Any],
        *,
        user_daily_limit: int,
        global_daily_limit: int,
    ) -> dict[str, Any]:
        async with self._lock:
            row = copy.deepcopy(await self._aread(record.user_id, record.session_id))
            for turn in row["turns"]:
                if turn["request_id"] == request_id:
                    if turn["message"] != message or ({"ignore_memory": False} | turn["page"]) != (
                        {"ignore_memory": False} | page
                    ):
                        raise StorageConflict(request_id)
                    return copy.deepcopy(turn) | {"replay": True, "version": row["version"]}
            if row["version"] != record.version or row["running_turn"]:
                raise StorageConflict(record.session_id)
            await asyncio.to_thread(
                self._charge, record.user_id, request_id, user_daily_limit, global_daily_limit
            )
            generation = (
                await asyncio.to_thread(
                    self.files.read_json,
                    self.files.path("users", record.user_id, "memory", "state.json"),
                    {},
                )
            ).get("generation", 0)
            now = _now()
            turn = {
                "id": str(uuid4()),
                "conversation_id": row["id"],
                "user_id": row["user_id"],
                "request_id": request_id,
                "sequence": row["next_turn"],
                "source_order": int(datetime.now(UTC).timestamp() * 1_000_000),
                "generation": generation,
                "message": message,
                "page": page,
                "raw_messages": [raw_user],
                "display": [],
                "completion": {},
                "status": "running",
                "display_version": 1,
                "created_at": now,
                "memory_status": "waiting",
                "memory_attempts": 0,
                "memory_next_attempt": now,
            }
            row["turns"].append(turn)
            row["messages"].append(raw_user)
            row["pending_app_events"] = []
            row["running_turn"] = turn["id"]
            row["next_turn"] += 1
            row["version"] += 1
            row["updated_at"] = now
            if turn["sequence"] == 1:
                row["title"] = message[:32]
            await self._acommit(row, raw=[raw_user])
            return copy.deepcopy(turn) | {"replay": False, "version": row["version"]}

    async def finish(
        self,
        record: SessionRecord[ShoppingSessionState],
        turn_id: str,
        raw_messages: list[dict[str, Any]],
        display: list[dict[str, Any]],
        completion: dict[str, Any],
        status: str,
        *,
        memory_prefix: dict[str, Any] | None = None,
    ) -> None:
        async with self._lock:
            row = copy.deepcopy(await self._aread(record.user_id, record.session_id))
            turn = next((t for t in row["turns"] if t["id"] == turn_id), None)
            if turn is None:
                raise RecordNotFound(turn_id)
            if turn["status"] != "running":
                if turn["status"] != status:
                    raise StorageConflict(turn_id)
                return
            if row["version"] != record.version or row["running_turn"] != turn_id:
                raise StorageConflict(turn_id)
            if memory_prefix is not None:
                path = (
                    self._directory(record.user_id, record.session_id)
                    / "memory-prefixes"
                    / f"{turn_id}.json"
                )
                await asyncio.to_thread(self.files.atomic_json, path, memory_prefix)
                turn["memory_prefix_ref"] = turn_id
            turn.update(
                raw_messages=raw_messages,
                memory_boundary=f"{row['version'] + 1}:{len(raw_messages) - 2}"
                if len(raw_messages) > 1
                else f"{row['version']}:0",
                display=display,
                completion=completion,
                status=status,
                completed_at=_now(),
                memory_status="pending"
                if status == "complete" and not turn["page"].get("ignore_memory")
                else "skipped",
            )
            row.update(
                state=record.state.model_dump(mode="json"),
                pending_app_events=list(record.pending_app_events),
                messages=copy.deepcopy(record.messages),
                context=record.working_context.model_dump(mode="json"),
                version=row["version"] + 1,
                running_turn=None,
                updated_at=_now(),
            )
            await self._acommit(row, raw=raw_messages[1:])

    async def recover(self) -> None:
        async with self._lock:
            for events in self.files.path("users").glob("*/conversations/*/events.jsonl"):
                user_id, session_id = events.parents[2].name, events.parent.name
                transcript = events.parent / "transcript.jsonl"
                await asyncio.to_thread(self.files.repair_jsonl_tail, events)
                await asyncio.to_thread(self.files.repair_jsonl_tail, transcript)
                await asyncio.to_thread(self.files.read_jsonl, events)
                row = copy.deepcopy(await self._aread(user_id, session_id))
                raw_entries = await asyncio.to_thread(self.files.read_jsonl, transcript)
                max_version = row["version"] + (1 if row["running_turn"] else 0)
                committed = [
                    entry
                    for entry in raw_entries
                    if int(entry["id"].split(":", 1)[0]) <= max_version
                ]
                if len(committed) != len(raw_entries):
                    body = "".join(
                        json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n"
                        for entry in committed
                    )
                    await asyncio.to_thread(self.files.atomic_text, transcript, body)
                changed = False
                for turn in row["turns"]:
                    if turn["status"] == "running":
                        turn.update(
                            status="interrupted", memory_status="skipped", completed_at=_now()
                        )
                        turn["display"].append(
                            {
                                "type": "error",
                                "text": "上一轮回复中断，请继续提问。已完成的购物车操作仍然保留。",
                            }
                        )
                        changed = True
                    elif turn["memory_status"] == "processing":
                        turn["memory_status"] = "pending"
                        changed = True
                if row["running_turn"]:
                    row["running_turn"] = None
                    row["version"] += 1
                    row["pending_app_events"].append(
                        "Previous turn was interrupted. Read the current cart before acting; do not repeat writes."
                    )
                    changed = True
                if changed:
                    await self._acommit(row)

    async def claim_memory(
        self, user_id: str | None, retries: int, lease_seconds: float, *, coalesce: bool = False
    ) -> dict[str, Any] | None:
        async with self._lock:
            paths = self.files.path("users").glob("*/conversations/*/events.jsonl")
            candidates = []
            processing_users: set[str] = set()
            now = _now()
            for events in paths:
                owner, session = events.parents[2].name, events.parent.name
                if user_id and owner != user_id:
                    continue
                row = await self._aread(owner, session)
                for turn in row["turns"]:
                    if turn["memory_status"] == "processing":
                        processing_users.add(owner)
                    if (
                        turn["memory_status"] in {"pending", "failed"}
                        and turn["memory_attempts"] < retries
                        and turn["memory_next_attempt"] <= now
                    ):
                        candidates.append((turn["source_order"], owner, session, turn["id"]))
            candidates = [
                candidate for candidate in candidates if candidate[1] not in processing_users
            ]
            if not candidates:
                return None
            _, owner, session, turn_id = min(candidates)
            same_session = [
                candidate for candidate in candidates if candidate[1:3] == (owner, session)
            ]
            if coalesce and len(same_session) > 1:
                _, _, _, turn_id = max(same_session)
            row = copy.deepcopy(await self._aread(owner, session))
            turn = next(t for t in row["turns"] if t["id"] == turn_id)
            coalesced = (
                {item[3] for item in same_session if item[3] != turn_id} if coalesce else set()
            )
            for prior in row["turns"]:
                if prior["id"] in coalesced:
                    prior["memory_status"] = "complete"
                    prior["memory_coalesced_into"] = turn_id
            turn["memory_trailing"] = bool(coalesced)
            turn["memory_status"] = "processing"
            turn["memory_attempts"] += 1
            turn["memory_claim_id"] = str(uuid4())
            turn["memory_claimed_until"] = (
                datetime.now(UTC) + timedelta(seconds=lease_seconds)
            ).isoformat()
            await self._acommit(row)
            return copy.deepcopy(turn)

    async def finish_memory(self, turn_id: str, claim_id: str, success: bool, delay: float) -> None:
        async with self._lock:
            for events in self.files.path("users").glob("*/conversations/*/events.jsonl"):
                owner, session = events.parents[2].name, events.parent.name
                row = copy.deepcopy(await self._aread(owner, session))
                turn = next((t for t in row["turns"] if t["id"] == turn_id), None)
                if turn is None or turn.get("memory_claim_id") != claim_id:
                    continue
                turn["memory_status"] = "complete" if success else "failed"
                turn["memory_next_attempt"] = (
                    datetime.now(UTC) + timedelta(seconds=delay)
                ).isoformat()
                turn["memory_claim_id"] = None
                await self._acommit(row)
                if success and turn.get("memory_prefix_ref"):
                    await asyncio.to_thread(
                        (
                            self._directory(owner, session)
                            / "memory-prefixes"
                            / f"{turn['memory_prefix_ref']}.json"
                        ).unlink,
                        missing_ok=True,
                    )
                return


class LocalMemoryStore:
    def __init__(self, files: LocalFiles):
        self.files = files
        self._lock = asyncio.Lock()

    def _directory(self, subject_id: str) -> Path:
        return self.files.path("users", _uuid(subject_id), "memory")

    def _state(self, subject_id: str) -> dict[str, Any]:
        return self.files.read_json(
            self._directory(subject_id) / "state.json",
            {"generation": 0, "facts": {}, "deleted": {}},
        )

    def _write(self, subject_id: str, state: dict[str, Any]) -> None:
        directory = self._directory(subject_id)
        self.files.atomic_json(directory / "state.json", state)
        index = [f"- [{key}]({state['facts'][key]['file']})" for key in sorted(state["facts"])]
        self.files.atomic_text(directory / "MEMORY.md", "# 用户记忆\n\n" + "\n".join(index) + "\n")

    def _write_fact(self, subject_id: str, fact: MemoryFact, order: int) -> str:
        file_name = f"{hashlib.sha256(fact.key.encode()).hexdigest()[:24]}-{order}.md"
        metadata = fact.model_dump(mode="json", exclude={"value"})
        body = "---\n" + json.dumps(metadata, ensure_ascii=False) + "\n---\n\n" + fact.value + "\n"
        self.files.atomic_text(self._directory(subject_id) / file_name, body)
        return file_name

    def _read_fact(self, subject_id: str, file_name: str) -> MemoryFact:
        if Path(file_name).name != file_name:
            raise StorageUnavailable("Invalid memory file reference")
        body = (self._directory(subject_id) / file_name).read_text(encoding="utf-8")
        lines = body.splitlines()
        if len(lines) < 4 or lines[0] != "---" or lines[2] != "---":
            raise StorageUnavailable("Memory Markdown has invalid frontmatter")
        return MemoryFact.model_validate(json.loads(lines[1]) | {"value": "\n".join(lines[4:])})

    async def get_facts(self, subject_id: str) -> list[MemoryFact]:
        async with self._lock:
            state = await asyncio.to_thread(self._state, subject_id)
            return [
                await asyncio.to_thread(self._read_fact, subject_id, item["file"])
                for item in state["facts"].values()
            ]

    async def search_facts(self, subject_id: str, query: str) -> list[MemoryFact]:
        return match_facts(await self.get_facts(subject_id), query)

    async def upsert_facts(self, subject_id: str, facts: list[MemoryFact]) -> None:
        await self.upsert_if_current(subject_id, facts, generation=None, source_order=None)

    async def upsert_if_current(
        self,
        subject_id: str,
        facts: list[MemoryFact],
        *,
        generation: int | None,
        source_order: int | None = None,
    ) -> list[MemoryFact]:
        async with self._lock:
            state = self._state(subject_id)
            if generation is not None and generation != state["generation"]:
                return []
            order = source_order or int(datetime.now(UTC).timestamp() * 1_000_000)
            accepted = []
            stale_files: list[Path] = []
            for fact in facts:
                if (
                    state["deleted"].get(fact.key, -1) >= order
                    or state["facts"].get(fact.key, {}).get("source_order", -1) > order
                ):
                    continue
                updated = fact.model_copy(update={"updated_at": datetime.now(UTC)})
                previous = state["facts"].get(fact.key)
                file_name = await asyncio.to_thread(self._write_fact, subject_id, updated, order)
                state["facts"][fact.key] = {"file": file_name, "source_order": order}
                if previous and previous["file"] != file_name:
                    stale_files.append(self._directory(subject_id) / previous["file"])
                accepted.append(updated)
            if accepted:
                await asyncio.to_thread(self._write, subject_id, state)
                for path in stale_files:
                    await asyncio.to_thread(path.unlink, missing_ok=True)
            return accepted

    async def delete_fact(self, subject_id: str, key: str) -> bool:
        async with self._lock:
            state = self._state(subject_id)
            previous = state["facts"].pop(key, None)
            deleted = previous is not None
            state["deleted"][key] = int(datetime.now(UTC).timestamp() * 1_000_000)
            await asyncio.to_thread(self._write, subject_id, state)
            if previous:
                await asyncio.to_thread(
                    (self._directory(subject_id) / previous["file"]).unlink, missing_ok=True
                )
            return deleted

    async def clear(self, subject_id: str) -> None:
        async with self._lock:
            state = self._state(subject_id)
            state["generation"] += 1
            stale_files = [
                self._directory(subject_id) / item["file"] for item in state["facts"].values()
            ]
            state["facts"] = {}
            state["deleted"] = {}
            await asyncio.to_thread(self._write, subject_id, state)
            for path in stale_files:
                await asyncio.to_thread(path.unlink, missing_ok=True)

    async def purge_generation(self, subject_id: str) -> int:
        return self._state(subject_id)["generation"]
