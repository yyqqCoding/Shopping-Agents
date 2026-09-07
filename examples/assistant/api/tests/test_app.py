# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The public catalog and the verified visitor boundary of the deployed assistant."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from demo_common.tests.experience_fixtures import AUTH_A, AUTH_B, USER_A, USER_B

from ..main import build_config

GATEWAY_VARS = ("SHOPPING_MODEL", "SHOPPING_MEMORY_MODEL", "SHOPPING_THINKING_EFFORT")


def test_health_lists_the_agent_surface(client: TestClient) -> None:
    health = client.get("/api/health").json()
    assert health["ok"] is True
    assert health["store"] == "ACME"
    assert health["products"] > 0
    # The five flows the page's agent can load.
    assert sorted(health["skills"]) == [
        "customer-care",
        "memory-personalization",
        "planning-goals",
        "purchase-research",
        "search-discovery",
    ]


def test_session_uses_verified_identity_and_rejects_profile_impersonation(
    client, conversation_store
):
    body = {"request_id": str(uuid4())}
    assert client.post("/api/conversations", json=body).status_code == 401
    assert (
        client.post("/api/session", json=body | {"user_id": USER_B}, headers=AUTH_A).status_code
        == 422
    )
    first = client.post("/api/conversations", json=body, headers=AUTH_A).json()
    retry = client.post("/api/conversations", json=body, headers=AUTH_A).json()
    assert first == retry
    assert conversation_store.rows[first["session_id"]].user_id == USER_A
    assert "name" not in first and "user_id" not in first


def test_catalog_reads_are_public_and_detail_is_enriched(client: TestClient) -> None:
    products = client.get("/api/products").json()["products"]
    assert products
    detail = client.get(f"/api/products/{products[0]['product_id']}").json()
    assert "price_intelligence" in detail
    assert "review_aspects" in detail


def test_orders_need_a_verified_session_and_do_not_inherit_demo_orders(client, shopper):
    assert client.get("/api/orders").status_code == 401
    orders = client.get("/api/orders", headers=shopper()).json()["orders"]
    assert orders == []


def test_add_button_is_provenance_gated(client, shopper):
    headers = shopper()
    response = client.post(
        "/api/cart/add",
        json={"product_id": "AR-1002", "quantity": 1, "request_id": str(uuid4())},
        headers=headers,
    )
    # Nothing searched yet, so the session has no provenance for the product.
    assert response.status_code == 400
    assert response.json()["detail"]


def test_new_conversation_preserves_the_old_one_and_does_not_seed_memory(client, shopper):
    first, second = shopper("AR-1002"), shopper()
    ids = {
        c["id"] for c in client.get("/api/conversations", headers=AUTH_A).json()["conversations"]
    }
    assert ids == {first["X-Session-Id"], second["X-Session-Id"]}
    for headers in (first, second):
        assert client.get("/api/memory", headers=headers).json() == {"facts": []}
        assert client.get("/api/cart", headers=headers).json()["items"] == []
    assert client.post("/api/reset", json={"clear_memory": True}, headers=first).status_code == 404


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("GET", "/api/cart", None),
        ("GET", "/api/orders", None),
        ("GET", "/api/memory", None),
        ("PATCH", "/api/memory", {"key": "material", "value": "只选棉质"}),
        ("DELETE", "/api/memory", {"key": "material"}),
        ("DELETE", "/api/memory/all", None),
        ("POST", "/api/cart/add", {"product_id": "AR-1002", "request_id": str(uuid4())}),
        ("POST", "/api/chat", {"message": "你好", "request_id": str(uuid4())}),
        ("GET", "/api/conversations/{id}/turns", None),
        ("GET", "/api/conversations/{id}/turns/00000000-0000-4000-8000-000000000003", None),
    ],
)
def test_another_visitors_known_conversation_id_grants_no_access(
    client, shopper, method, path, body
):
    victim = shopper("AR-1002", auth=AUTH_B)["X-Session-Id"]
    headers = AUTH_A | {"X-Session-Id": victim}
    response = client.request(method, path.format(id=victim), headers=headers, json=body)
    assert response.status_code == 404


def test_conversation_listing_is_owned_and_paginated(client, shopper):
    first, second = shopper(), shopper()
    shopper(auth=AUTH_B)
    page = client.get("/api/conversations?limit=1", headers=AUTH_A).json()
    tail = client.get("/api/conversations?offset=1&limit=1", headers=AUTH_A).json()
    assert page["has_more"] and not tail["has_more"]
    assert {page["conversations"][0]["id"], tail["conversations"][0]["id"]} == {
        first["X-Session-Id"],
        second["X-Session-Id"],
    }


def test_build_config_defaults_when_the_gateway_vars_are_blank(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for var in GATEWAY_VARS:
        monkeypatch.delenv(var, raising=False)
    config = build_config()
    assert config.model == "claude-sonnet-5"
    assert config.memory_model == "claude-haiku-4-5-20251001"
    assert config.thinking_effort == "low"


def test_build_config_reads_the_gateway_vars(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SHOPPING_MODEL", "gateway-chat")
    monkeypatch.setenv("SHOPPING_MEMORY_MODEL", "gateway-memo")
    monkeypatch.setenv("SHOPPING_THINKING_EFFORT", "high")
    config = build_config()
    assert (config.model, config.memory_model, config.thinking_effort) == (
        "gateway-chat",
        "gateway-memo",
        "high",
    )
    monkeypatch.setenv("SHOPPING_THINKING_EFFORT", "off")
    assert build_config().thinking_effort is None
