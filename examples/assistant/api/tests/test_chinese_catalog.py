"""Chinese retrieval, grounding and strict structured filters in the demo catalog."""

import pytest

from commerce_common.grounding import find_token, first_forced_tool
from shopping_agent import SearchFilters, ShoppingSessionState
from shopping_agent.grounding import GROUNDING_RULES

from ..main import build_config


@pytest.mark.parametrize(
    "query,expected",
    [
        ("两个人露营的帐篷", {"AR-1201", "AR-1202"}),
        ("滴滤咖啡机", {"AR-1001"}),
        ("儿童木制积木", {"AR-1401"}),
        ("特大号床垫", {"AR-1902"}),
    ],
)
async def test_chinese_queries_find_the_expected_products(backend, session, query, expected):
    result = await backend.search_products(session, query)
    assert {p.product_id for p in result[:3]} & expected


@pytest.mark.parametrize(
    "query,expected",
    [("如何退货退款？", "returns"), ("配送费用多少", "shipping"), ("保修政策", "warranty")],
)
async def test_chinese_policy_queries_match(backend, session, query, expected):
    assert (await backend.search_policies(session, query))[0].policy_id == expected


@pytest.mark.parametrize(
    "filters",
    [
        SearchFilters(category="does-not-exist"),
        SearchFilters(attributes={"材质": "不存在的材质"}),
        SearchFilters(attributes={"尺寸": "特大号"}, max_price=30),
        SearchFilters(attributes={"尺寸": "特大号", "颜色": "浅粉色"}, in_stock=True),
    ],
)
async def test_impossible_conditions_are_not_dropped_to_fill_the_result(backend, session, filters):
    assert await backend.search_products(session, "枕套", filters) == []


async def test_one_variant_must_satisfy_price_size_and_stock_together(backend, session):
    filters = SearchFilters(
        category="furniture-bedroom", max_price=600, in_stock=True, attributes={"size": "queen"}
    )
    result = await backend.search_products(session, "床垫", filters)
    assert "AR-1902" in {p.product_id for p in result}
    too_expensive = await backend.search_products(
        session, "床垫", filters.model_copy(update={"attributes": {"size": "king"}})
    )
    assert "AR-1902" not in {p.product_id for p in too_expensive}


@pytest.mark.parametrize(
    "text,tool", [("退货政策是什么？", "search_policies"), ("可以查询订单吗？", "get_orders")]
)
def test_chinese_grounding_works_without_word_spaces(text, tool):
    assert first_forced_tool(GROUNDING_RULES, build_config(), text, ShoppingSessionState()) == tool


def test_fullwidth_and_chinese_adjacent_variant_ids_are_not_truncated():
    patterns = build_config().product_id_patterns
    assert find_token("请看ＡＲ－１９０２－ＫＩＮＧ的详情", patterns) == "AR-1902-KING"


async def test_price_and_review_evidence_is_the_same_for_agent_and_detail_page(
    backend, session, client
):
    product_id = "AR-1902-KING"
    detail = await backend.get_product_details(session, product_id)
    shown = client.get(f"/api/products/{product_id}").json()
    assert shown["price_intelligence"] == backend.price_intelligence(product_id)
    assert shown["review_aspects"] == backend.review_aspects(product_id)
    assert shown["price_intelligence"]["series"][-1] == detail.price
    assert shown["price_intelligence"]["verdict"] in detail.specs["模拟价格说明"]
    assert all(
        aspect["name"] in detail.specs["模拟评价摘要"]
        for aspect in shown["review_aspects"]["aspects"]
    )
