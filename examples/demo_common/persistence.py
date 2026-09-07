"""Conversation checkpoints, append-only turns, carts and ordered memory in PostgreSQL.

Every operation names the verified owner. Multi-record writes and compare-and-set
checks live in the migration's RPCs, not in separate HTTP requests.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any
from uuid import uuid4

from commerce_common.context import WorkingContext
from commerce_common.memory import match_facts
from commerce_common.types import MemoryFact
from shopping_agent import Cart, ShoppingSessionContext, ShoppingSessionState

from .sessions import SessionRecord
from .supabase import Supabase

CART_OPERATION: ContextVar[str | None] = ContextVar("cart_operation", default=None)


class ConversationStore:
    def __init__(self, database: Supabase):
        self.database = database

    async def create(self, user_id: str, request_id: str) -> dict[str, Any]:
        return await self.database.rpc(
            "experience_create_conversation", p_user_id=user_id, p_request_id=request_id
        )

    async def list(self, user_id: str, offset: int, limit: int) -> list[dict[str, Any]]:
        return await self.database.rpc(
            "experience_list_conversations", p_user_id=user_id, p_offset=offset, p_limit=limit
        )

    async def load(self, user_id: str, session_id: str) -> SessionRecord[ShoppingSessionState]:
        row = await self.database.rpc(
            "experience_load_conversation", p_user_id=user_id, p_id=session_id
        )
        record = SessionRecord(
            session_id=row["id"],
            user_id=row["user_id"],
            state=ShoppingSessionState.model_validate(row["state"]),
            messages=row["messages"],
            pending_app_events=row["pending_app_events"],
            version=row["version"],
            working_context=WorkingContext.model_validate(row["context"]),
            running_turn=row["running_turn"],
        )
        record.stored_state = record.state_document()
        record.stored_messages = len(record.messages)
        return record

    async def save(self, record: SessionRecord[ShoppingSessionState]) -> None:
        if record.state_document() == record.stored_state:
            return
        version = await self.database.rpc(
            "experience_save_state",
            p_user_id=record.user_id,
            p_id=record.session_id,
            p_version=record.version,
            p_state=record.state.model_dump(mode="json"),
            p_events=record.pending_app_events,
        )
        record.version = version
        record.stored_state = record.state_document()

    async def history(
        self, user_id: str, session_id: str, before: int | None, limit: int
    ) -> list[dict[str, Any]]:
        return await self.database.rpc(
            "experience_history",
            p_user_id=user_id,
            p_id=session_id,
            p_before=before,
            p_limit=limit,
        )

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
        return await self.database.rpc_idempotent(
            "experience_begin_turn",
            p_user_id=record.user_id,
            p_id=record.session_id,
            p_version=record.version,
            p_request_id=request_id,
            p_message=message,
            p_page=page,
            p_raw_user=raw_user,
            p_user_daily_limit=user_daily_limit,
            p_global_daily_limit=global_daily_limit,
        )

    async def get_turn(self, user_id: str, session_id: str, request_id: str) -> dict[str, Any]:
        return await self.database.rpc(
            "experience_get_turn", p_user_id=user_id, p_id=session_id, p_request_id=request_id
        )

    async def finish(
        self,
        record: SessionRecord[ShoppingSessionState],
        turn_id: str,
        raw_messages: list[dict[str, Any]],
        display: list[dict[str, Any]],
        completion: dict[str, Any],
        status: str,
    ) -> None:
        await self.database.rpc(
            "experience_finish_turn",
            p_user_id=record.user_id,
            p_id=record.session_id,
            p_turn_id=turn_id,
            p_version=record.version,
            p_state=record.state.model_dump(mode="json"),
            p_events=record.pending_app_events,
            p_messages=record.messages,
            p_context=record.working_context.model_dump(mode="json"),
            p_raw_messages=raw_messages,
            p_display=display,
            p_completion=completion,
            p_status=status,
        )

    async def recover(self) -> None:
        await self.database.rpc("experience_recover")

    async def claim_memory(
        self,
        user_id: str | None,
        retries: int,
        lease_seconds: float,
    ) -> dict[str, Any] | None:
        return await self.database.rpc(
            "experience_claim_memory",
            p_user_id=user_id,
            p_max_attempts=retries,
            p_lease_seconds=lease_seconds,
        )

    async def finish_memory(self, turn_id: str, claim_id: str, success: bool, delay: float) -> None:
        await self.database.rpc(
            "experience_finish_memory",
            p_turn_id=turn_id,
            p_claim_id=claim_id,
            p_success=success,
            p_delay=delay,
        )


class SupabaseMemoryStore:
    def __init__(self, database: Supabase):
        self.database = database

    async def get_facts(self, subject_id: str) -> list[MemoryFact]:
        rows = await self.database.rpc("experience_memory_read", p_user_id=subject_id)
        return [MemoryFact.model_validate(row) for row in rows]

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
        keys = await self.database.rpc(
            "experience_memory_write",
            p_user_id=subject_id,
            p_facts=[fact.model_dump(mode="json") for fact in facts],
            p_generation=generation,
            p_source_order=source_order,
        )
        return [fact for fact in facts if fact.key in keys]

    async def delete_fact(self, subject_id: str, key: str) -> bool:
        return await self.database.rpc("experience_memory_delete", p_user_id=subject_id, p_key=key)

    async def clear(self, subject_id: str) -> None:
        await self.database.rpc("experience_memory_clear", p_user_id=subject_id)

    async def purge_generation(self, subject_id: str) -> int:
        return await self.database.rpc("experience_memory_generation", p_user_id=subject_id)


class PersistentCarts:
    """A cart read is fresh; each mutation is committed before a tool reports success."""

    def __init__(self, database: Supabase):
        self.database = database

    async def get(self, session: ShoppingSessionContext) -> Cart:
        row = await self.database.rpc(
            "experience_cart",
            p_user_id=session.user_id,
            p_id=session.session_id,
            p_action="get",
            p_product=None,
            p_quantity=0,
            p_operation=str(uuid4()),
        )
        return Cart.model_validate(row)

    async def change(
        self,
        session: ShoppingSessionContext,
        action: str,
        product: dict[str, Any],
        quantity: int,
    ) -> Cart:
        operation_id = CART_OPERATION.get() or str(uuid4())
        row = await self.database.rpc_idempotent(
            "experience_cart",
            p_user_id=session.user_id,
            p_id=session.session_id,
            p_action=action,
            p_product=product,
            p_quantity=quantity,
            p_operation=operation_id,
        )
        return Cart.model_validate(row)
