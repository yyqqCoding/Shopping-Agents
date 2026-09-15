"""Contract tests for the structured-condition SQL catalog adapter."""

from types import SimpleNamespace

import pytest

from shopping_agent import SearchFilters

from ..sql_retail import CatalogDatabase


@pytest.mark.anyio
async def test_search_sends_structured_values_and_keeps_page_metadata():
    calls = []

    async def rpc(name, **parameters):
        calls.append((name, parameters))
        return {
            "products": [
                {
                    "product_id": "OD-1001",
                    "title": "测试帐篷",
                    "price": 699,
                    "currency": "CNY",
                    "category": "outdoor-shelter",
                    "in_stock": True,
                    "attributes": {"weight_g": "1850"},
                }
            ],
            "has_more": True,
            "next_cursor": {"id": "OD-1001", "display_order": 1, "relevance": 2},
        }

    database = CatalogDatabase(SimpleNamespace(rpc=rpc))
    products = await database.search(
        "帐篷",
        SearchFilters(
            category="outdoor-shelter", max_price=800, attributes={"max_weight_g": "2000"}
        ),
        6,
    )

    assert products[0].product_id == "OD-1001"
    name, parameters = calls[0]
    assert name == "catalog_search_products"
    assert parameters["p_category"] == "outdoor-shelter"
    assert parameters["p_max_price"] == 800
    assert parameters["p_attributes"] == {"max_weight_g": "2000"}
    assert "select" not in parameters and "sql" not in parameters
    assert database.last_page["has_more"] is True


@pytest.mark.anyio
async def test_product_payload_is_validated_before_reaching_agent():
    async def rpc(name, **parameters):
        del name, parameters
        return {
            "product_id": "OD-1001",
            "title": "测试帐篷",
            "price": 699,
            "currency": "CNY",
            "in_stock": True,
            "variants": [],
        }

    product = await CatalogDatabase(SimpleNamespace(rpc=rpc)).product("OD-1001")
    assert product is not None
    assert product.product_id == "OD-1001"
