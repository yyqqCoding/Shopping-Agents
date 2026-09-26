# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

from datetime import datetime

import pytest

from commerce_common.types import MemoryCategory, MemoryFact
from demo_common.storefront_fixtures import load_json
from shopping_agent import SearchFilters, Unavailable

from ..mock_retail import DATA_DIR, MockRetail


def test_catalog_loads_and_validates(backend):
    assert len(backend.products) >= 50
    assert backend.store_name == "户外装备助手"
    sample = backend.products["OD-1001"]
    assert sample.brand is None  # the outdoor equipment is unbranded
    assert sample.long_description  # hero products carry a long description


async def test_search_relevance(backend, session):
    tents = await backend.search_products(session, "双人帐篷")
    assert tents and tents[0].product_id in {"OD-1001", "OD-1002", "OD-1006", "OD-1007"}

    lamps = await backend.search_products(session, "充电头灯")
    assert lamps and lamps[0].product_id == "OD-6002"

    poles = await backend.search_products(session, "登山杖")
    assert {p.product_id for p in poles[:2]} == {"OD-8001", "OD-8002"}

    # An English word reaches the Chinese titles through the search synonyms.
    headlamps = await backend.search_products(session, "headlamp")
    assert headlamps and all("头灯" in p.title for p in headlamps[:4])

    nothing = await backend.search_products(session, "zzzqqq")
    assert nothing == []


async def test_out_of_stock_items_are_searchable(backend, session):
    packs = await backend.search_products(session, "大容量徒步背包")
    assert any(p.product_id == "OD-3012" and p.in_stock is False for p in packs)


async def test_delivery_promises_stamped(backend):
    for product in backend.products.values():
        promise = product.attributes.get("delivery")
        if product.in_stock:
            assert promise == "标准配送约 3–5 个工作日"
        else:
            assert promise is None

    # The promise is kept out of search scoring.
    sample = next(p for p in backend.products.values() if p.in_stock)
    assert "标准配送" not in backend._searchable_text(sample)["attributes"]


def test_memory_seed_is_schema_valid():
    seed = load_json(DATA_DIR, "memory-seed.json")
    assert "demo-user" in seed
    for facts in seed.values():
        for raw in facts:
            fact = MemoryFact(
                key=raw["key"], value=raw["value"], category=MemoryCategory(raw["category"])
            )
            assert fact.key and fact.value


async def test_search_filters_and_sort(backend, session):
    cheap_lamps = await backend.search_products(session, "头灯", SearchFilters(max_price=100))
    assert cheap_lamps and all(p.price <= 100 for p in cheap_lamps)
    assert all(p.product_id != "OD-6002" for p in cheap_lamps)

    shelter_only = await backend.search_products(
        session, "帐篷 睡袋 头灯", SearchFilters(category="outdoor-shelter"), limit=20
    )
    assert shelter_only and all(p.category == "outdoor-shelter" for p in shelter_only)

    by_price = await backend.search_products(
        session, "背包", SearchFilters(sort="price_asc"), limit=20
    )
    prices = [p.price for p in by_price]
    assert prices == sorted(prices)


async def test_policy_search(backend, session):
    returns = await backend.search_policies(session, "how do refunds and returns work")
    assert returns and returns[0].policy_id == "returns"

    packs = await backend.search_policies(session, "背包选多大容量")
    assert packs and packs[0].policy_id == "OUT-PACK"


async def test_fulfillment_options_follow_the_shipping_policy(backend, session):
    terms = backend._terms
    standard, express = await backend.get_fulfillment_options(session, ["OD-1001"])
    assert standard.method == express.method == "delivery"
    assert backend.products["OD-1001"].price > terms["free_shipping_over"] and standard.fee == 0
    assert express.fee == terms["express_fee"]
    cheapest = min((p for p in backend.products.values() if p.in_stock), key=lambda p: p.price)
    (paid, _express) = await backend.get_fulfillment_options(session, [cheapest.product_id])
    assert paid.fee == terms["standard_fee"]

    with pytest.raises(Unavailable):
        await backend.get_fulfillment_options(session, ["OD-1012"])  # authored out of stock

    shipping = next(p for p in backend._policies if p.policy_id == "shipping").content
    for term in (
        f"高于 {terms['free_shipping_over']} 元",
        f"运费 {terms['standard_fee']} 元",
        f"加急配送 {terms['express_fee']} 元",
        terms["standard_eta"],
        terms["express_eta"],
    ):
        assert term in shipping, term


def test_pickup_eta_stays_inside_store_hours():
    eta = MockRetail._pickup_eta
    # Two hours of prep, rounded up to the hour.
    assert eta(datetime(2026, 7, 14, 13, 0)) == "今天 15:00 前"
    assert eta(datetime(2026, 7, 14, 13, 20)) == "今天 16:00 前"
    # Before opening, the two hours count from the 9 AM open.
    assert eta(datetime(2026, 7, 14, 6, 30)) == "今天 11:00 前"
    # 19:00 plus two hours lands on the 9 PM close.
    assert eta(datetime(2026, 7, 14, 19, 0)) == "今天 21:00 前"
    assert eta(datetime(2026, 7, 14, 19, 30)) == "明天上午"
    assert eta(datetime(2026, 7, 14, 23, 0)) == "明天上午"


async def test_a_family_is_found_by_its_option_values_and_its_variants_stay_out_of_listings(
    backend, session
):
    assert "OD-4004" in backend.products and "OD-4004-XL" not in backend.products
    assert backend.variants["OD-4004-XL"].variant_of == "OD-4004"
    # "XL" appears in no title or description, only among the apparel sizes.
    hits = await backend.search_products(session, "XL", limit=20)
    assert hits and all(hit.category == "outdoor-apparel" for hit in hits)
    assert all(hit.options == {"size": ["S", "M", "L", "XL"]} for hit in hits)
    assert all(hit.variant_of is None for hit in hits)


async def test_details_resolve_a_family_and_a_variant(backend, session):
    family = await backend.get_product_details(session, "AR-1606")
    assert family is not None and set(family.options) == {"size", "color"}
    assert len(family.variants) == 8
    assert all(set(v.option_values) == {"size", "color"} for v in family.variants)
    variant = await backend.get_product_details(session, "ar-1606-king-blush")
    assert variant is not None and variant.variant_of == "AR-1606"
    assert variant.in_stock is False and variant.price == 37.0
    assert backend.listing_of("AR-1606-KING-BLUSH").product_id == family.product_id
    assert "模拟评价摘要" in family.specs and "模拟价格说明" in variant.specs


async def test_an_order_line_for_a_variant_names_its_choice(backend, session):
    orders = await backend.get_orders(session)
    lines = [item for order in orders for item in order.items if item.variant_of]
    assert [(i.product_id, i.option_values, i.variant_of) for i in lines] == [
        ("AR-1902-QUEEN", {"size": "queen"}, "AR-1902")
    ]
