# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The assistant API is the shared storefront host over the retail mock: these cover what
the chat-only page calls (session, catalog, cart, orders, memory, reset, the add button's
gate) without a model. The shared host's own behavior is under demo_common's contract."""

import pytest
from fastapi.testclient import TestClient

from demo_common.tests.fixtures import start_shopper

from ..main import build_config, host

app = host.app

GATEWAY_VARS = ("SHOPPING_MODEL", "SHOPPING_MEMORY_MODEL", "SHOPPING_THINKING_EFFORT")


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, base_url="http://localhost")


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


def test_session_returns_the_demo_profile(client: TestClient) -> None:
    started = client.post("/api/session", json={"user_id": "demo-user"}).json()
    assert started["session_id"]
    assert started["name"]


def test_catalog_reads_are_public_and_detail_is_enriched(client: TestClient) -> None:
    products = client.get("/api/products").json()["products"]
    assert products
    detail = client.get(f"/api/products/{products[0]['product_id']}").json()
    assert "price_intelligence" in detail
    assert "review_aspects" in detail


def test_orders_need_a_session(client: TestClient) -> None:
    assert client.get("/api/orders").status_code == 401
    orders = client.get("/api/orders", headers=start_shopper(client)).json()["orders"]
    assert orders


def test_add_button_is_provenance_gated(client: TestClient) -> None:
    headers = start_shopper(client)
    response = client.post(
        "/api/cart/add", json={"product_id": "AR-1002", "quantity": 1}, headers=headers
    )
    # Nothing searched yet, so the session has no provenance for the product.
    assert response.status_code == 400
    assert response.json()["detail"]


def test_reset_reseeds_memory(client: TestClient) -> None:
    headers = start_shopper(client)
    fresh = client.post("/api/reset", json={"clear_memory": True}, headers=headers).json()
    headers = {"X-Session-Id": fresh["session_id"]}
    facts = client.get("/api/memory", headers=headers).json()["facts"]
    assert isinstance(facts, list)


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
