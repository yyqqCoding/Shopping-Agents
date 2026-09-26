"""The Java commerce adapter against a stand-in service, and the checkout card's submit route."""

import json
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from demo_common.storefront import install_catalog_routes
from shopping_agent import SearchFilters, ShoppingSessionContext, Unavailable
from shopping_agent_runtime import ShoppingAgent

from ..java_retail import CommerceError, JavaRetail
from ..main import REPO_ROOT, build_config
from ..mock_retail import MockRetail

USER = "00000000-0000-4000-8000-00000000000a"
CONVERSATION = "00000000-0000-4000-8000-00000000000b"
SESSION = ShoppingSessionContext(session_id=CONVERSATION, user_id=USER)

PRODUCT = {
    "product_id": "OD-1001",
    "title": "双人徒步帐篷",
    "price": 699.0,
    "currency": "CNY",
    "category": "outdoor-shelter",
    "in_stock": True,
    "attributes": {"weight_g": "1850", "low_stock": "4"},
}


def service(handler):
    """A JavaRetail whose requests go to ``handler(request) -> (status, body)``."""
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        status, body = handler(request)
        return httpx.Response(status, json=body)

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    return JavaRetail("http://commerce.internal:8080", "secret", client=client), requests


def problem(code: str, detail: str) -> dict:
    return {"code": code, "detail": detail, "title": code}


@pytest.mark.anyio
async def test_search_sends_structured_values_and_keeps_the_page():
    page = {"products": [PRODUCT], "has_more": True, "next_cursor": {"id": "OD-1001", "price": 699}}
    backend, requests = service(lambda request: (200, page))
    products = await backend.search_products(
        SESSION,
        "轻量帐篷",
        SearchFilters(
            category="outdoor-shelter", max_price=800, attributes={"max_weight_g": "2000"}
        ),
        6,
    )
    assert products[0].product_id == "OD-1001"
    assert backend.last_page == {"has_more": True, "next_cursor": {"id": "OD-1001", "price": 699}}
    request = requests[0]
    assert request.url.path == "/internal/v1/catalog/search"
    assert request.headers["Authorization"] == "Bearer secret"
    assert request.headers["X-User-Id"] == USER
    assert request.headers["X-Conversation-Id"] == CONVERSATION
    body = json.loads(request.content)
    assert body["category"] == "outdoor-shelter" and body["max_price"] == 800
    assert body["attributes"] == {"max_weight_g": "2000"}
    assert "帐篷" in body["terms"] and body["limit"] == 6
    assert "sql" not in body and "select" not in body


@pytest.mark.anyio
async def test_details_carry_the_evidence_into_specs_and_unknown_ids_are_none():
    evidence = {
        "price_intelligence": {"series": [650, 699], "verdict": "处于常规区间"},
        "review_aspects": {"aspects": [{"name": "防风", "mentions": 12, "positive_pct": 90}]},
    }

    def handler(request):
        if request.url.path.endswith("/OD-1001"):
            return 200, PRODUCT | {"specs": {"重量": "1850 g"}, "evidence": evidence}
        return 404, problem("NOT_FOUND", "未找到这件商品")

    backend, _ = service(handler)
    details = await backend.get_product_details(SESSION, "OD-1001")
    assert details.specs["模拟价格说明"] == "处于常规区间"
    assert backend.price_intelligence("OD-1001") == evidence["price_intelligence"]
    assert await backend.get_product_details(SESSION, "OD-9999") is None


def test_the_equipment_routes_list_and_read_through_the_service():
    def handler(request):
        if request.url.path == "/internal/v1/catalog/products":
            return 200, {"products": [PRODUCT], "has_more": False, "total": 1}
        if request.url.path.endswith("/OD-1001"):
            return 200, PRODUCT | {"specs": {"重量": "1850 g"}}
        return 404, problem("NOT_FOUND", "未找到这件商品")

    backend, requests = service(handler)
    app = FastAPI()
    install_catalog_routes(app, backend)
    client = TestClient(app)
    listing = client.get("/api/products", params={"category": "outdoor-shelter"}).json()
    assert [p["product_id"] for p in listing["products"]] == ["OD-1001"]
    assert requests[0].url.params["category"] == "outdoor-shelter"
    assert client.get("/api/products/OD-1001").json()["specs"] == {"重量": "1850 g"}
    assert client.get("/api/products/OD-9999").status_code == 404


@pytest.mark.anyio
async def test_a_refused_cart_write_is_unavailable_and_an_outage_is_not():
    backend, _ = service(
        lambda request: (409, problem("UNAVAILABLE", "OD-1001 库存不足，仅剩 4 件"))
    )
    with pytest.raises(Unavailable, match="仅剩 4 件"):
        await backend.add_to_cart(SESSION, "OD-1001", 5)
    down, _ = service(lambda request: (500, problem("INTERNAL", "服务暂时不可用")))
    with pytest.raises(CommerceError):
        await down.add_to_cart(SESSION, "OD-1001", 1)


@pytest.mark.anyio
async def test_submitting_sends_the_card_lines_under_the_idempotency_key():
    order = {
        "order_id": "SO1",
        "status": "processing",
        "placed_at": "2026-09-25T02:00:00Z",
        "items": [{"product_id": "OD-1001", "title": "双人徒步帐篷", "quantity": 2, "price": 699}],
        "total": 1398,
        "currency": "CNY",
    }
    backend, requests = service(lambda request: (200, order))
    key = str(uuid4())
    placed = await backend.submit_order(SESSION, [("OD-1001", 2)], key)
    assert placed.order_id == "SO1"
    request = requests[0]
    assert request.headers["Idempotency-Key"] == key
    assert json.loads(request.content) == {
        "conversation_id": CONVERSATION,
        "lines": [{"sku_id": "OD-1001", "quantity": 2}],
    }


def test_the_model_sees_the_same_prompt_and_tools_over_either_backend():
    config = build_config()
    skills = REPO_ROOT / "shopping-agent" / "skills"
    java, _ = service(lambda request: (200, {}))
    over_java = ShoppingAgent(backend=java, skills_dir=skills, config=config)
    over_fixtures = ShoppingAgent(backend=MockRetail(), skills_dir=skills, config=config)
    assert over_java._static_system == over_fixtures._static_system
    assert over_java._tools == over_fixtures._tools


# -- the checkout card's submit button ---------------------------------------------------


def submit_body(*lines):
    return {
        "request_id": str(uuid4()),
        "lines": [{"product_id": pid, "quantity": qty} for pid, qty in lines],
    }


def test_submit_needs_the_order_service(client, shopper):
    response = client.post("/api/orders", json=submit_body(("OD-1001", 1)), headers=shopper())
    assert response.status_code == 409


def test_a_submitted_order_is_announced_to_the_next_turn(
    client, shopper, main, monkeypatch, conversation_store
):
    order = {
        "order_id": "SO42",
        "status": "processing",
        "placed_at": "2026-09-25T02:00:00Z",
        "items": [{"product_id": "OD-1001", "title": "双人徒步帐篷", "quantity": 2, "price": 699}],
        "total": 1398,
        "currency": "CNY",
    }
    backend, requests = service(lambda request: (200, order))
    monkeypatch.setattr(main, "backend", backend)
    headers = shopper()
    response = client.post("/api/orders", json=submit_body(("OD-1001", 2)), headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["order"]["order_id"] == "SO42"
    assert response.json()["cart"]["items"] == []
    assert (
        requests[0].headers["X-User-Id"] == conversation_store.rows[headers["X-Session-Id"]].user_id
    )
    events = conversation_store.rows[headers["X-Session-Id"]].pending_app_events
    assert events and "SO42" in events[0]


def test_a_refused_submission_shows_the_services_reason(client, shopper, main, monkeypatch):
    backend, _ = service(
        lambda request: (409, problem("CART_CHANGED", "购物车已变化，请让助手重新整理结算"))
    )
    monkeypatch.setattr(main, "backend", backend)
    response = client.post("/api/orders", json=submit_body(("OD-1001", 1)), headers=shopper())
    assert response.status_code == 409
    assert response.json()["detail"] == "购物车已变化，请让助手重新整理结算"
