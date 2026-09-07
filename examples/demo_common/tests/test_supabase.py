"""Authentication and transport failures at the real Supabase adapter boundary."""

import base64
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException

from demo_common.persistence import (
    CART_OPERATION,
    ConversationStore,
    PersistentCarts,
    SupabaseMemoryStore,
)
from demo_common.supabase import (
    QuotaExceeded,
    RecordNotFound,
    StorageConflict,
    StorageUnavailable,
    Supabase,
    SupabaseSettings,
)
from demo_common.tests.experience_fixtures import USER_A, USER_B
from shopping_agent import ShoppingSessionContext

SETTINGS = SupabaseSettings("https://identity.example.test", "public-test", "service-test")


async def test_identity_comes_from_auth_service_not_unsigned_token_claims():
    claims = base64.urlsafe_b64encode(json.dumps({"sub": USER_A}).encode()).decode().rstrip("=")
    forged = f"header.{claims}.unsigned"

    def respond(request):
        assert request.url.path == "/auth/v1/user"
        assert request.headers["Authorization"] == f"Bearer {forged}"
        assert request.headers["apikey"] == SETTINGS.public_key
        return httpx.Response(200, json={"id": USER_B})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        assert await Supabase(SETTINGS, client).current_user(f"Bearer {forged}") == USER_B


@pytest.mark.parametrize(
    "response,error",
    [
        (httpx.Response(401), HTTPException),
        (httpx.Response(503), StorageUnavailable),
        (httpx.Response(200, json={"id": "demo-user"}), StorageUnavailable),
        (httpx.Response(200, json={"id": 42}), StorageUnavailable),
    ],
)
async def test_invalid_identity_or_unavailable_auth_never_falls_back_to_demo_user(response, error):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: response)) as client:
        with pytest.raises(error):
            await Supabase(SETTINGS, client).current_user("Bearer invalid")


@pytest.mark.parametrize(
    "public_key",
    ["service-test", "sb_secret_never_public", "e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature"],
)
def test_public_configuration_cannot_expose_a_service_credential(public_key):
    assert not SupabaseSettings(SETTINGS.url, public_key, SETTINGS.service_key).configured


@pytest.mark.parametrize(
    "code,error",
    [
        ("P0002", RecordNotFound),
        ("40001", StorageConflict),
        ("23505", StorageConflict),
        ("PT429", QuotaExceeded),
        ("XX000", StorageUnavailable),
    ],
)
async def test_rpc_maps_database_errors_without_exposing_rows_or_secrets(code, error):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(400, json={"code": code, "message": "secret-row"})
        )
    ) as client:
        with pytest.raises(error) as caught:
            await Supabase(SETTINGS, client).rpc("operation", p_user_id=USER_A)
        assert "secret-row" not in str(caught.value) and SETTINGS.service_key not in str(
            caught.value
        )


async def test_cart_retry_reuses_the_operation_and_returns_the_committed_cart(monkeypatch):
    requests = []

    def respond(request):
        body = json.loads(request.content)
        requests.append(body)
        assert request.headers["apikey"] == SETTINGS.service_key
        if len(requests) == 1:
            raise httpx.ReadTimeout("Response lost after commit")
        return httpx.Response(200, json={"items": [], "currency": "USD"})

    monkeypatch.setattr("demo_common.supabase.asyncio.sleep", AsyncMock())
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        carts = PersistentCarts(Supabase(SETTINGS, client))
        version = CART_OPERATION.set("00000000-0000-4000-8000-000000000009")
        try:
            await carts.change(
                ShoppingSessionContext(session_id=USER_B, user_id=USER_A),
                "add",
                {"product_id": "AR-1001"},
                1,
            )
        finally:
            CART_OPERATION.reset(version)
    assert len(requests) == 2 and requests[0] == requests[1]
    assert requests[0]["p_operation"].endswith("0009")
    assert requests[0]["p_user_id"] == USER_A and requests[0]["p_id"] == USER_B


async def test_conditional_memory_write_sends_captured_version_and_reports_only_accepted_facts():
    from commerce_common.types import MemoryCategory, MemoryFact

    calls = []

    def respond(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json=["color"])

    facts = [
        MemoryFact(key=key, value="偏好棉质", category=MemoryCategory.PREFERENCE)
        for key in ("color", "material")
    ]
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        result = await SupabaseMemoryStore(Supabase(SETTINGS, client)).upsert_if_current(
            USER_A, facts, generation=4, source_order=7
        )
    assert result == facts[:1]
    assert (
        calls[0]["p_generation"] == 4
        and calls[0]["p_source_order"] == 7
        and calls[0]["p_user_id"] == USER_A
    )


async def test_conversation_load_restores_context_and_provenance_and_keeps_read_only_requests_read_only():
    calls = []
    row = {
        "id": USER_B,
        "user_id": USER_A,
        "state": {},
        "messages": [{"role": "user", "content": "预算 800"}],
        "pending_app_events": [],
        "context": {"summary": "已比较两个选择", "covered_turns": 3},
        "version": 7,
        "running_turn": None,
    }

    def respond(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json=row)

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        store = ConversationStore(Supabase(SETTINGS, client))
        record = await store.load(USER_A, USER_B)
        assert record.working_context.covered_turns == 3 and record.messages == row["messages"]
        await store.save(record)
    assert calls == [{"p_user_id": USER_A, "p_id": USER_B}]
