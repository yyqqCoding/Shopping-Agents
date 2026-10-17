"""User-owned topic Markdown, file versions, settings and Agent memory snapshots."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import time
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any
from zoneinfo import ZoneInfo

import yaml

from commerce_common.memory import MEMORY_WRITE_VERSION
from commerce_common.topic_memory import MemorySettings, parse_topic

from .local_files import LocalFiles
from .local_persistence import LocalMemoryStore, _uuid
from .storage_errors import StorageConflict


class LocalTopicMemoryStore(LocalMemoryStore):
    """The legacy contract remains available; conversation paths use bounded file reads."""

    topic_memory = True

    def __init__(self, files: LocalFiles):
        super().__init__(files)
        self._ready: set[str] = set()

    def directory(self, user: str, namespace: str = "auto") -> Path:
        base = self.files.path("users", _uuid(user))
        if namespace == "auto":
            return base / "memory"
        if namespace == "instructions":
            return base / "instructions"
        match = re.fullmatch(r"agent/(user|project|local)/([a-zA-Z0-9_-]{1,64})", namespace)
        if not match:
            raise ValueError("Invalid memory namespace")
        scope, agent = match.groups()
        return (
            base
            / ("agent-memory" if scope == "user" else f"projects/default/agent-memory-{scope}")
            / agent
        )

    def path(self, user: str, name: str, namespace: str = "auto") -> Path:
        parts = PurePosixPath(name)
        if (
            not name
            or "\\" in name
            or ":" in name
            or "\0" in name
            or parts.is_absolute()
            or any(p in {"..", "."} or p.startswith(".") for p in parts.parts)
            or not name.endswith(".md")
            or len(name) > 200
        ):
            raise ValueError("Use a relative Markdown filename inside the memory directory")
        root = self.directory(user, namespace).resolve()
        result = root.joinpath(*parts.parts).resolve()
        if not result.is_relative_to(root):
            raise ValueError("Memory path leaves its namespace")
        return result

    def _prepare(self, user: str) -> None:
        if user in self._ready:
            return
        root = self.directory(user)
        root.mkdir(parents=True, exist_ok=True)
        state = self._state(user)
        if state.pop("clear_pending", False):
            self._clear_personal_documents(user)
            self.files.atomic_json(root / "state.json", state)
        if not state.get("topic_version"):
            links = []
            stale = []
            for key, item in state.get("facts", {}).items():
                fact = self._read_fact(user, item["file"])
                name = f"user_{hashlib.sha256(key.encode()).hexdigest()[:20]}.md"
                header = yaml.safe_dump(
                    {"name": key, "description": fact.value[:150], "type": "user"},
                    allow_unicode=True,
                    sort_keys=False,
                )
                self.files.atomic_text(root / name, f"---\n{header}---\n\n{fact.value}\n")
                links.append(f"- [{key}]({name}) — {fact.value[:100]}")
                stale.append(root / item["file"])
            if links:
                self.files.atomic_text(root / "MEMORY.md", "\n".join(links) + "\n")
            state.update(topic_version=1, facts={}, files={}, cursors={})
            self.files.atomic_json(root / "state.json", state)
            for path in stale:
                path.unlink(missing_ok=True)
        self._ready.add(user)

    async def _call(self, user: str, operation: Any, *args: Any) -> Any:
        async with self._lock:

            def run() -> Any:
                self._prepare(user)
                return operation(*args)

            task = asyncio.create_task(asyncio.to_thread(run))
            try:
                return await asyncio.shield(task)
            except asyncio.CancelledError:
                # A cancelled coroutine must not release the state lock while its
                # filesystem thread is still mutating the same directory.
                await task
                raise

    async def settings(self, user: str, changes: dict[str, Any] | None = None) -> MemorySettings:
        def run() -> MemorySettings:
            path = self.directory(user) / "settings.json"
            defaults = {
                "extract_enabled": os.environ.get("SHOPPING_MEMORY_EXTRACT", "true").lower()
                == "true",
                "prefetch_enabled": os.environ.get("SHOPPING_MEMORY_PREFETCH", "false").lower()
                == "true",
                "dream_enabled": os.environ.get("SHOPPING_MEMORY_DREAM", "true").lower() == "true",
            }
            values = defaults | self.files.read_json(path, {})
            result = MemorySettings.model_validate(values | (changes or {}))
            self.directory(user, result.namespace)
            ZoneInfo(result.timezone)
            if changes is not None:
                self.files.atomic_json(path, result.model_dump())
            return result

        return await self._call(user, run)

    async def catalog(
        self, user: str, namespace: str = "auto", *, limit: int = 200
    ) -> list[dict[str, Any]]:
        def run() -> list[dict[str, Any]]:
            root = self.directory(user, namespace)
            rows = []
            for path in root.rglob("*.md") if root.exists() else []:
                if path.name == "MEMORY.md" or path.is_symlink():
                    continue
                if not path.resolve().is_relative_to(root.resolve()):
                    continue
                with path.open(encoding="utf-8") as handle:
                    lines = []
                    for _ in range(30):
                        line = handle.readline(8192)
                        if not line:
                            break
                        lines.append(line)
                info = parse_topic("".join(lines), strict=False)
                rows.append(
                    {
                        "filename": path.relative_to(root).as_posix(),
                        "name": info.get("name", path.stem),
                        "description": info.get("description", ""),
                        "type": info.get("type", ""),
                        "mtime": path.stat().st_mtime,
                    }
                )
            return sorted(rows, key=lambda r: r["mtime"], reverse=True)[:limit]

        return await self._call(user, run)

    async def read(
        self,
        user: str,
        name: str,
        namespace: str = "auto",
        *,
        offset: int = 0,
        lines: int = 200,
        byte_limit: int = 32000,
    ) -> dict[str, Any]:
        def run() -> dict[str, Any]:
            path = self.path(user, name, namespace)
            if not path.exists():
                return {
                    "filename": name,
                    "namespace": namespace,
                    "content": "",
                    "revision": None,
                    "missing": True,
                }
            raw = path.read_bytes()
            all_lines = raw.decode("utf-8").splitlines(keepends=True)
            content = "".join(all_lines[offset : offset + lines])
            bounded = content.encode("utf-8")[:byte_limit].decode("utf-8", errors="ignore")
            truncated = offset + lines < len(all_lines) or bounded != content
            return {
                "filename": name,
                "namespace": namespace,
                "content": bounded,
                "revision": hashlib.sha256(raw).hexdigest(),
                "mtime": path.stat().st_mtime,
                "total_lines": len(all_lines),
                "offset": offset,
                "truncated": truncated,
            }

        return await self._call(user, run)

    async def stat(self, user: str, name: str, namespace: str = "auto") -> dict[str, Any]:
        def run() -> dict[str, Any]:
            path = self.path(user, name, namespace)
            if not path.exists():
                return {"missing": True, "mtime": None}
            value = path.stat()
            return {"missing": False, "mtime": value.st_mtime, "size": value.st_size}

        return await self._call(user, run)

    async def write(
        self,
        user: str,
        name: str,
        content: str,
        namespace: str = "auto",
        *,
        expected: str | None = None,
        check_revision: bool = False,
        generation: int | None = None,
        order: int | None = None,
        append: bool = False,
    ) -> dict[str, Any]:
        version = MEMORY_WRITE_VERSION.get()
        if version and version.subject_id == user:
            generation, order = version.generation, version.source_order

        def run() -> dict[str, Any]:
            path = self.path(user, name, namespace)
            if len(content.encode("utf-8")) > 250000:
                raise ValueError("Memory file exceeds 250000 bytes")
            state = self._state(user)
            key = namespace + ":" + name
            previous = state.setdefault("files", {}).get(key, {})
            stamp = order or time.time_ns() // 1000
            if generation is not None and generation != state["generation"]:
                raise StorageConflict("Memory was cleared; do not restore old content")
            if max(previous.get("order", 0), state.get("deleted", {}).get(key, 0)) > stamp:
                raise StorageConflict("A newer memory change takes precedence")
            old = path.read_text(encoding="utf-8") if path.exists() and not append else ""
            actual = hashlib.sha256(old.encode()).hexdigest() if path.exists() else None
            if check_revision and expected != actual:
                raise StorageConflict("Memory changed; read the file again before editing")
            if append:
                if not name.startswith("logs/"):
                    raise ValueError("Append is for dated logs")
                result = content
            else:
                result = content
            if namespace != "instructions" and name != "MEMORY.md" and not name.startswith("logs/"):
                parse_topic(result)
            if append:
                path.parent.mkdir(parents=True, exist_ok=True)
                with path.open("a", encoding="utf-8", newline="\n") as handle:
                    handle.write(content)
                    handle.flush()
                    os.fsync(handle.fileno())
                with path.open("rb") as handle:
                    revision = hashlib.file_digest(handle, "sha256").hexdigest()
            else:
                self.files.atomic_text(path, result)
                revision = hashlib.sha256(result.encode()).hexdigest()
            state["files"][key] = {"order": stamp, "updated_at": datetime.now(UTC).isoformat()}
            state["last_write"] = stamp
            self.files.atomic_json(self.directory(user) / "state.json", state)
            return {
                "filename": name,
                "namespace": namespace,
                "revision": revision,
                "updated_at": state["files"][key]["updated_at"],
            }

        return await self._call(user, run)

    async def remove(
        self,
        user: str,
        name: str,
        namespace: str = "auto",
        *,
        expected: str | None = None,
        check_revision: bool = False,
    ) -> bool:
        def run() -> bool:
            path = self.path(user, name, namespace)
            exists = path.exists()
            if check_revision:
                actual = hashlib.sha256(path.read_bytes()).hexdigest() if exists else None
                if actual != expected:
                    raise StorageConflict("Memory changed after the review")
            state = self._state(user)
            state.setdefault("deleted", {})[namespace + ":" + name] = time.time_ns() // 1000
            state["forgotten_after"] = time.time()
            state.setdefault("files", {}).pop(namespace + ":" + name, None)
            self.files.atomic_json(self.directory(user) / "state.json", state)
            path.unlink(missing_ok=True)
            index = self.directory(user, namespace) / "MEMORY.md"
            if index.exists() and name != "MEMORY.md":
                body = index.read_text(encoding="utf-8")
                self.files.atomic_text(
                    index,
                    "\n".join(line for line in body.splitlines() if f"]({name})" not in line)
                    + "\n",
                )
            return exists

        return await self._call(user, run)

    async def cursor(
        self, user: str, session: str, update: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        def run() -> dict[str, Any]:
            state = self._state(user)
            value = state.setdefault("cursors", {}).setdefault(_uuid(session), {})
            if update is not None:
                value.update(update)
                self.files.atomic_json(self.directory(user) / "state.json", state)
            return dict(value)

        return await self._call(user, run)

    async def search(self, user: str, query: str, namespace: str = "auto") -> list[dict[str, Any]]:
        if not query or len(query) > 200:
            raise ValueError("Supply a narrow search term")

        def run() -> list[dict[str, Any]]:
            root = self.directory(user, namespace)
            rows = []
            for path in root.rglob("*.md") if root.exists() else []:
                if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
                    continue
                with path.open(encoding="utf-8") as handle:
                    for number, line in enumerate(handle, 1):
                        if query.casefold() in line.casefold():
                            rows.append(
                                {
                                    "filename": path.relative_to(root).as_posix(),
                                    "line": number,
                                    "text": line[:1000],
                                }
                            )
                            if len(rows) >= 30:
                                return rows
            return rows

        return await self._call(user, run)

    async def history(self, user: str, query: str) -> list[dict[str, Any]]:
        if not query or len(query) > 200:
            raise ValueError("Supply a narrow history search term")

        def run() -> list[dict[str, Any]]:
            rows = []
            root = self.files.path("users", _uuid(user), "conversations")
            for path in root.glob("*/transcript.jsonl"):
                with path.open(encoding="utf-8") as handle:
                    for line in handle:
                        entry = json.loads(line)
                        text = json.dumps(entry["message"], ensure_ascii=False)
                        if query.casefold() in text.casefold():
                            rows.append(
                                {
                                    "conversation": path.parent.name,
                                    "message_id": entry["id"],
                                    "excerpt": text[:1500],
                                }
                            )
                            if len(rows) >= 30:
                                return rows
            return rows

        return await self._call(user, run)

    async def get_facts(self, subject_id: str) -> list[Any]:
        return []

    async def upsert_facts(self, subject_id: str, facts: list[Any]) -> None:
        raise ValueError("Use typed Markdown memory files")

    async def upsert_if_current(
        self,
        subject_id: str,
        facts: list[Any],
        *,
        generation: int | None,
        source_order: int | None = None,
    ) -> list[Any]:
        raise ValueError("Use versioned typed Markdown memory writes")

    async def delete_fact(self, subject_id: str, key: str) -> bool:
        return await self.remove(subject_id, key)

    async def search_facts(self, subject_id: str, query: str) -> list[Any]:
        raise ValueError("Use the topic manifest and read selected memory files")

    async def clear(self, subject_id: str) -> None:
        def run() -> None:
            state = self._state(subject_id)
            state["generation"] += 1
            state["forgotten_after"] = time.time()
            state.update(files={}, facts={}, deleted={}, cursors={}, clear_pending=True)
            self.files.atomic_json(self.directory(subject_id) / "state.json", state)
            self._clear_personal_documents(subject_id)
            state.pop("clear_pending", None)
            self.files.atomic_json(self.directory(subject_id) / "state.json", state)

        await self._call(subject_id, run)

    def _clear_personal_documents(self, user: str) -> None:
        base = self.files.path("users", _uuid(user))
        roots = [self.directory(user), base / "agent-memory", base / "projects" / "default"]
        for root in roots:
            for path in root.rglob("*.md") if root.exists() else []:
                if path.resolve().is_relative_to(base):
                    path.unlink()

    async def purge_generation(self, subject_id: str) -> int:
        return await self._call(subject_id, lambda: self._state(subject_id)["generation"])

    async def forget_barrier(self, subject_id: str) -> float:
        return await self._call(
            subject_id, lambda: self._state(subject_id).get("forgotten_after", 0)
        )

    async def snapshot(self, user: str, namespace: str, action: str = "check") -> dict[str, Any]:
        if not namespace.startswith("agent/"):
            raise ValueError("Select an Agent memory namespace")
        self.directory(user, namespace)
        agent = namespace.split("/")[-1]

        def run() -> dict[str, Any]:
            root = self.files.path(
                "users", _uuid(user), "projects", "default", "agent-memory-snapshots", agent
            )
            local = self.directory(user, namespace)
            meta = self.files.read_json(root / "snapshot.json", {})
            synced = self.files.read_json(local / ".snapshot-synced.json", {})
            has_local = local.exists() and any(local.glob("*.md"))
            status = (
                "none"
                if not meta or synced.get("syncedFrom") == meta.get("updatedAt")
                else "prompt-update"
                if has_local
                else "initialize"
            )
            if action == "save":
                root.mkdir(parents=True, exist_ok=True)
                for path in root.glob("*.md"):
                    path.unlink()
                for path in local.glob("*.md"):
                    self.files.atomic_text(root / path.name, path.read_text(encoding="utf-8"))
                meta = {"updatedAt": datetime.now(UTC).isoformat()}
                self.files.atomic_json(root / "snapshot.json", meta)
                self.files.atomic_json(
                    local / ".snapshot-synced.json", {"syncedFrom": meta["updatedAt"]}
                )
                status = "none"
            elif action in {"initialize", "replace", "keep"} and meta:
                if action == "initialize" and has_local:
                    raise StorageConflict("Local Agent memory already exists")
                if action != "keep":
                    state = self._state(user)
                    state["generation"] += 1
                    self.files.atomic_json(self.directory(user) / "state.json", state)
                    for path in local.glob("*.md"):
                        path.unlink()
                    for path in root.glob("*.md"):
                        self.files.atomic_text(local / path.name, path.read_text(encoding="utf-8"))
                self.files.atomic_json(
                    local / ".snapshot-synced.json", {"syncedFrom": meta["updatedAt"]}
                )
                status = "none"
            elif action != "check":
                raise ValueError("Invalid snapshot action or missing snapshot")
            return {
                "action": status,
                "snapshot_timestamp": meta.get("updatedAt"),
                "namespace": namespace,
            }

        return await self._call(user, run)

    async def dream_gate(
        self, user: str, session: str, *, manual: bool = False, daily: bool = False
    ) -> dict[str, Any] | None:
        settings = await self.settings(user)

        def run() -> dict[str, Any] | None:
            root = self.directory(user)
            lock = root / ".consolidate-lock"
            last = lock.stat().st_mtime if lock.exists() else 0
            now = time.time()
            state = self._state(user)
            if state.get("dream_running") and now - state["dream_running"].get("at", now) < 3600:
                return None
            if not manual:
                if daily:
                    if not settings.daily_mode or not settings.dream_enabled:
                        return None
                    today = datetime.now(ZoneInfo(settings.timezone)).date().isoformat()
                    if state.get("daily_consolidated") == today:
                        return None
                elif (
                    not settings.dream_enabled
                    or settings.daily_mode
                    or now - last < settings.dream_min_hours * 3600
                ):
                    return None
                if now - state.get("dream_scan_at", 0) < 600:
                    return None
            state["dream_scan_at"] = now
            conversations = self.files.path("users", _uuid(user), "conversations")
            sessions = [
                p.parent.name
                for p in conversations.glob("*/transcript.jsonl")
                if p.parent.name != session and p.stat().st_mtime > last
            ]
            self.files.atomic_json(root / "state.json", state)
            if not manual and not daily and len(sessions) < settings.dream_min_sessions:
                return None
            state["dream_running"] = {"pid": os.getpid(), "at": now, "prior": last}
            self.files.atomic_json(root / "state.json", state)
            self.files.atomic_text(lock, str(os.getpid()))
            return {"prior": last, "sessions": sessions, "daily": daily}

        return await self._call(user, run)

    async def finish_dream(self, user: str, gate: dict[str, Any], success: bool) -> None:
        def run() -> None:
            state = self._state(user)
            state.pop("dream_running", None)
            lock = self.directory(user) / ".consolidate-lock"
            if not success:
                if gate["prior"]:
                    self.files.atomic_text(lock, "")
                    os.utime(lock, (gate["prior"], gate["prior"]))
                else:
                    lock.unlink(missing_ok=True)
            elif gate.get("daily"):
                settings = MemorySettings.model_validate(
                    self.files.read_json(self.directory(user) / "settings.json", {})
                )
                state["daily_consolidated"] = (
                    datetime.now(ZoneInfo(settings.timezone)).date().isoformat()
                )
            self.files.atomic_json(self.directory(user) / "state.json", state)

        await self._call(user, run)

    async def recover_memory(self) -> None:
        async with self._lock:

            def run() -> None:
                for path in self.files.path("users").glob("*/memory/state.json"):
                    state = self.files.read_json(path)
                    if state.pop("clear_pending", False):
                        self._clear_personal_documents(path.parent.parent.name)
                        self.files.atomic_json(path, state)
                    for key, stamp in state.get("deleted", {}).items():
                        if ":" in key:
                            namespace, name = key.split(":", 1)
                            if state.get("files", {}).get(key, {}).get("order", 0) <= stamp:
                                self.path(path.parent.parent.name, name, namespace).unlink(
                                    missing_ok=True
                                )
                    running = state.pop("dream_running", None)
                    if running:
                        lock = path.parent / ".consolidate-lock"
                        if running.get("prior"):
                            self.files.atomic_text(lock, "")
                            os.utime(lock, (running["prior"], running["prior"]))
                        else:
                            lock.unlink(missing_ok=True)
                        self.files.atomic_json(path, state)

            await asyncio.to_thread(run)
