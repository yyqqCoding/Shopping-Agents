# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""Detail-page enrichment and the low-stock stamp the inventory overlay drives."""

from ..mock_retail import LOW_STOCK_ATTRIBUTE, MockRetail

# -- low-stock stamp -------------------------------------------------------------------


def test_low_stock_stamped_from_the_inventory_overlay(backend):
    assert backend.products["AR-2102"].attributes.get(LOW_STOCK_ATTRIBUTE) == "3"


def test_low_stock_not_stamped_above_threshold_or_out_of_stock(backend):
    for product in backend.products.values():
        chip = product.attributes.get(LOW_STOCK_ATTRIBUTE)
        if not product.in_stock:
            assert chip is None
        if chip is not None:
            assert int(chip) > 0


def test_stamped_attributes_kept_out_of_search_scoring(backend):
    text = backend._searchable_text(backend.products["AR-2102"])
    assert "low_stock" not in text["attributes"]
    assert "Get it by" not in text["attributes"]


# -- price intelligence ----------------------------------------------------------------


def test_price_intelligence_is_deterministic_and_in_range(backend):
    first = backend.price_intelligence("AR-1401")
    second = MockRetail().price_intelligence("AR-1401")
    assert first == second

    price = backend.products["AR-1401"].price
    assert first["series"][-1] == price  # the series ends at the current price
    assert first["low"] <= price <= first["high"]
    assert first["low"] == min(first["series"])
    assert first["high"] == max(first["series"])
    assert first["days"] == 90
    assert first["position"] in {"low", "typical", "high"}
    assert f"${price:.2f}" in first["verdict"]


def test_price_intelligence_verdict_matches_position(backend):
    for product_id in list(backend.products)[:20]:
        intel = backend.price_intelligence(product_id)
        assert intel is not None
        wording = {
            "low": "near this item's 90-day low",
            "typical": "typical price",
            "high": "above this item's typical price",
        }[intel["position"]]
        assert wording in intel["verdict"]


def test_price_intelligence_unknown_product_is_none(backend):
    assert backend.price_intelligence("AR-0000-nope") is None


# -- review aspects --------------------------------------------------------------------


def test_review_aspects_are_deterministic_and_bounded(backend):
    first = backend.review_aspects("AR-1401")
    second = MockRetail().review_aspects("AR-1401")
    assert first == second

    product = backend.products["AR-1401"]
    assert first["review_count"] == product.review_count
    assert 3 <= len(first["aspects"]) <= 4
    total_mentions = 0
    for aspect in first["aspects"]:
        assert 45 <= aspect["positive_pct"] <= 97
        assert aspect["mentions"] > 0
        total_mentions += aspect["mentions"]
    assert total_mentions <= product.review_count


def test_review_aspect_mentions_never_exceed_review_count(backend):
    for product in backend.products.values():
        synthesis = backend.review_aspects(product.product_id)
        if synthesis is None:
            continue
        assert sum(a["mentions"] for a in synthesis["aspects"]) <= product.review_count


def test_review_aspects_skipped_for_thin_review_counts(backend):
    thin = [p for p in backend.products.values() if (p.review_count or 0) < 25]
    if thin:
        assert backend.review_aspects(thin[0].product_id) is None
    assert backend.review_aspects("AR-0000-nope") is None
