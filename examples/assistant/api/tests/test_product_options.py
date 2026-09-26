# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""Products with options over HTTP: listings, the detail route, and the add button."""

from uuid import uuid4

import pytest

SHOE_SIZES = ["38", "39", "40", "41", "42", "43", "44"]


@pytest.fixture
def add(client, shopper, conversation_store):
    """Returns ``add(product_id, *seen) -> (response, session record)``."""

    def _add(product_id: str, *seen: str):
        headers = shopper(*seen)
        body = {"product_id": product_id, "quantity": 1, "request_id": str(uuid4())}
        response = client.post("/api/cart/add", json=body, headers=headers)
        return response, conversation_store.rows[headers["X-Session-Id"]]

    return _add


def test_listings_carry_the_family_and_none_of_its_variants(client):
    products = client.get("/api/products?category=outdoor-footwear").json()["products"]
    ids = {product["product_id"] for product in products}
    assert "OD-5001" in ids and not {pid for pid in ids if pid.startswith("OD-5001-")}
    family = next(product for product in products if product["product_id"] == "OD-5001")
    assert family["options"] == {"size": SHOE_SIZES}
    assert "variants" not in family


def test_the_detail_route_resolves_a_family_and_a_variant(client):
    family = client.get("/api/products/OD-5004").json()
    assert [v["product_id"] for v in family["variants"]] == [f"OD-5004-{s}" for s in SHOE_SIZES]
    assert [v["in_stock"] for v in family["variants"]] == [True] * 6 + [False]
    variant = client.get("/api/products/OD-5001-41").json()
    assert variant["variant_of"] == "OD-5001" and variant["price"] == 399.0
    assert variant["price_intelligence"] and variant["review_aspects"]


def test_the_add_button_on_a_family_is_held_with_the_route_to_a_variant(add):
    response, record = add("OD-5001", "OD-5001")
    assert response.status_code == 400
    assert "规格" in response.json()["detail"]
    assert record.pending_app_events == []


def test_the_add_button_on_a_seen_variant_writes_a_line_with_its_choice(add):
    response, record = add("OD-5001-41", "OD-5001", "OD-5001-41")
    assert response.status_code == 200
    [line] = response.json()["cart"]["items"]
    assert line["product_id"] == "OD-5001-41"
    assert line["option_values"] == {"size": "41"} and line["variant_of"] == "OD-5001"
    assert "OD-5001-41" in record.pending_app_events[0]


def test_a_sold_out_variant_is_refused_with_its_in_stock_siblings_named(add):
    response, record = add("OD-5004-44", "OD-5004", "OD-5004-44")
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "库存" in detail
    assert record.pending_app_events == []
