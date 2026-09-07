"""Controlled storage and identity services for host tests, not SQL substitutes.

The database's transaction contract is exercised separately by supabase/tests.
These doubles let HTTP and streaming tests pause or fail at each storage boundary.
"""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx

from commerce_common.memory import InMemoryMemoryStore
from demo_common.sessions import SessionRecord
from demo_common.supabase import RecordNotFound, StorageConflict, Supabase, SupabaseSettings
from shopping_agent import ShoppingSessionState

USER_A = "00000000-0000-4000-8000-000000000001"
USER_B = "00000000-0000-4000-8000-000000000002"
AUTH_A = {"Authorization": "Bearer visitor-a"}
AUTH_B = {"Authorization": "Bearer visitor-b"}


def identity_service() -> Supabase:
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/auth/v1/user", "Unexpected network operation in host test"
        user = {"Bearer visitor-a": USER_A, "Bearer visitor-b": USER_B}.get(
            request.headers.get("Authorization")
        )
        return httpx.Response(200, json={"id": user}) if user else httpx.Response(401)

    return Supabase(
        SupabaseSettings("https://identity.example.test", "public-test", "service-test"),
        httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )


class ConversationDouble:
    def __init__(self, memory: InMemoryMemoryStore | None = None):
        self.memory = memory or InMemoryMemoryStore()
        self.rows: dict[str, SessionRecord] = {}
        self.metadata: dict[str, dict] = {}
        self.created: dict[tuple[str, str], str] = {}
        self.turns: dict[str, dict] = {}
        self.recover = AsyncMock()
        self.claim_memory = AsyncMock(return_value=None)
        self.finish_memory = AsyncMock()
        self.begin = AsyncMock(side_effect=self._begin)
        self.finish = AsyncMock(side_effect=self._finish)

    def require(self, user_id: str, session_id: str) -> SessionRecord:
        row = self.rows.get(session_id)
        if row is None or row.user_id != user_id:
            raise RecordNotFound(session_id)
        return row

    async def create(self, user_id: str, request_id: str) -> dict:
        key = (user_id, request_id)
        if key not in self.created:
            session_id = str(uuid4())
            self.created[key] = session_id
            self.rows[session_id] = SessionRecord(
                session_id, user_id, ShoppingSessionState(), version=1
            )
            now = datetime.now(UTC).isoformat()
            self.metadata[session_id] = {
                "id": session_id,
                "title": "新对话",
                "created_at": now,
                "updated_at": now,
            }
        return copy.deepcopy(self.metadata[self.created[key]])

    async def list(self, user_id: str, offset: int, limit: int) -> list[dict]:
        rows = [self.metadata[key] for key, row in self.rows.items() if row.user_id == user_id]
        return copy.deepcopy(
            sorted(rows, key=lambda row: row["updated_at"], reverse=True)[offset : offset + limit]
        )

    async def load(self, user_id: str, session_id: str) -> SessionRecord:
        record = copy.deepcopy(self.require(user_id, session_id))
        record.stored_state = record.state_document()
        return record

    async def save(self, record: SessionRecord) -> None:
        if record.state_document() == record.stored_state:
            return
        row = self.require(record.user_id, record.session_id)
        if row.version != record.version or row.running_turn:
            raise StorageConflict(record.session_id)
        row.state = copy.deepcopy(record.state)
        row.pending_app_events = list(record.pending_app_events)
        row.version += 1

    async def history(
        self, user_id: str, session_id: str, before: int | None, limit: int
    ) -> list[dict]:
        self.require(user_id, session_id)
        turns = [
            t
            for t in self.turns.values()
            if t["conversation_id"] == session_id and (before is None or t["sequence"] < before)
        ]
        return copy.deepcopy(sorted(turns, key=lambda t: t["sequence"])[-limit:])

    async def get_turn(self, user_id: str, session_id: str, request_id: str) -> dict:
        self.require(user_id, session_id)
        turn = next(
            (
                t
                for t in self.turns.values()
                if t["conversation_id"] == session_id and t["request_id"] == request_id
            ),
            None,
        )
        if turn is None:
            raise RecordNotFound(request_id)
        return copy.deepcopy(turn)

    async def _begin(self, record, request_id, message, page, raw_user, **limits):
        row = self.require(record.user_id, record.session_id)
        prior = next(
            (
                t
                for t in self.turns.values()
                if t["conversation_id"] == record.session_id and t["request_id"] == request_id
            ),
            None,
        )
        if prior:
            if prior["message"] != message or prior["page"] != page:
                raise StorageConflict(request_id)
            return copy.deepcopy(prior) | {"replay": True, "version": row.version}
        if row.version != record.version or row.running_turn:
            raise StorageConflict(record.session_id)
        sequence = sum(t["conversation_id"] == row.session_id for t in self.turns.values()) + 1
        turn = {
            "id": str(uuid4()),
            "conversation_id": row.session_id,
            "user_id": row.user_id,
            "request_id": request_id,
            "sequence": sequence,
            "message": message,
            "page": page,
            "raw_messages": [copy.deepcopy(raw_user)],
            "display": [],
            "completion": {},
            "status": "running",
            "display_version": 1,
            "source_order": len(self.turns) + 1,
            "generation": await self.memory.purge_generation(row.user_id),
        }
        self.turns[turn["id"]] = turn
        row.messages.append(copy.deepcopy(raw_user))
        row.pending_app_events = []
        row.running_turn = turn["id"]
        row.version += 1
        self.metadata[row.session_id]["title"] = message[:32]
        return copy.deepcopy(turn) | {"replay": False, "version": row.version}

    async def _finish(self, record, turn_id, raw, display, completion, status):
        row = self.require(record.user_id, record.session_id)
        turn = self.turns[turn_id]
        if turn["status"] != "running":
            if turn["status"] != status:
                raise StorageConflict(turn_id)
            return
        if row.version != record.version or row.running_turn != turn_id:
            raise StorageConflict(turn_id)
        turn.update(
            copy.deepcopy(
                {
                    "raw_messages": raw,
                    "display": display,
                    "completion": completion,
                    "status": status,
                }
            )
        )
        self.rows[row.session_id] = copy.deepcopy(record)
        self.rows[row.session_id].version += 1
        self.rows[row.session_id].running_turn = None


def create_visitor(client, *seen: str, auth=None, store=None, backend=None) -> dict[str, str]:
    headers = dict(auth or AUTH_A)
    response = client.post("/api/conversations", json={"request_id": str(uuid4())}, headers=headers)
    assert response.status_code == 200, response.text
    session_id = response.json()["session_id"]
    headers["X-Session-Id"] = session_id
    if seen:
        store.rows[session_id].state.remember_products([backend.product(pid) for pid in seen])
    return headers
