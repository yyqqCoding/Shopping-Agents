# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The assistant API: the full shopping agent, hosted for the chat and equipment pages.

    uvicorn assistant.api.main:app --app-dir examples --port 8004

Supabase verifies anonymous visitors and stores conversations and memory. The catalog,
stock, carts and orders come from the Java commerce service when ``CATALOG_BACKEND=java``
(``java_retail.py``), or from the fixtures in data/ through ``mock_retail.py``.
"""

from __future__ import annotations

import os
from typing import cast
from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from commerce_common.config import ThinkingEffort
from demo_common import (
    REPO_ROOT,
    CartAddRequest,
    load_demo_env,
)
from demo_common.experience import build_experience_host
from demo_common.persistence import ConversationStore, SupabaseMemoryStore
from demo_common.supabase import Supabase, SupabaseSettings
from shopping_agent import Cart, ProductDetails, ShoppingAgentConfig
from shopping_agent.serialization import cart_payload
from shopping_agent_runtime import ShoppingAgent

from .java_retail import CommerceError, JavaRetail
from .mock_retail import MockRetail

EXAMPLE_ROOT = REPO_ROOT / "examples" / "assistant"
DATA_DIR = EXAMPLE_ROOT / "data"

# This demo's .env is the configuration surface: it outranks ambient ANTHROPIC_*
# variables in the shell (e.g. the ones a Claude Code setup exports machine-wide).
load_demo_env(EXAMPLE_ROOT, override=True)

# The .env placeholders left blank must read as unset. The SDK already treats a blank
# key or token as absent, but a blank ANTHROPIC_BASE_URL would become the base URL.
if not os.environ.get("ANTHROPIC_BASE_URL"):
    os.environ.pop("ANTHROPIC_BASE_URL", None)


def build_config() -> ShoppingAgentConfig:
    """The deployment's knobs. The model ids and the thinking effort read the
    environment so a gateway that serves its own ids (docs/deployment.md) needs no
    code change; the Anthropic client itself takes ANTHROPIC_BASE_URL and the key or
    token variables from the environment."""
    defaults = ShoppingAgentConfig()
    effort = os.environ.get("SHOPPING_THINKING_EFFORT", "").strip().lower()
    return ShoppingAgentConfig(
        brand_name="户外装备站",
        assistant_name="户外装备助手",
        brand_voice=(
            "使用简体中文，专业、自然、简洁。所有回复、卡片标题、推荐理由、追问和工具进度均使用中文。"
            "专注徒步、露营和轻量出行的装备选择、比较与成套规划；商品没有品牌前缀，"
            "不要沿用旧目录的商店名称。新商品以人民币报价，保留工具返回的币种，"
            "旧历史中的美元金额不得直接改成人民币。"
            "这是虚构户外商品的购物体验：顾客点击结算卡片上的“提交订单”后才生成订单并扣减库存，"
            "你不能代为提交；订单不收款、不发货。"
            "把重量、容量、温度和适用场景作为取舍依据；已有装备不重复推荐。"
            "天气、路线与现场条件由用户提供，不声称查询了实时天气或地图。"
            "只在与户外需求相关时使用长期偏好，本次行程与预算留在当前对话。"
            "静默应用偏好，不展示记忆状态，不说已记住或正在读取记忆。"
        ),
        domain_search_notes=(
            "使用中文装备关键词；分类为 outdoor-shelter、outdoor-sleep、outdoor-packs、"
            "outdoor-apparel、outdoor-footwear、outdoor-lighting、outdoor-cooking、outdoor-accessories。"
            "数值条件用 attributes.max_weight_g、min_capacity_l、min_people、"
            "max_comfort_temperature_c、min_r_value、min_waterproof_mm，值为对应单位的数值字符串。"
            "按睡袋舒适温度而非极限温度选型。模糊请求可先展示少量有区别的户外候选；"
            "明确行程时直接给出方案，只追问会改变选型的关键信息。硬性条件不满足时说明差异。"
            "AR 开头的旧商品已下架，仅可查看或移除。"
        ),
        product_id_patterns=(r"(?<![A-Z0-9_-])(?:OD|AR)-\d{4}(?:-[A-Z0-9]+)*(?![A-Z0-9_-])",),
        enable_orders=True,
        model=os.environ.get("SHOPPING_MODEL") or defaults.model,
        memory_model=os.environ.get("SHOPPING_MEMORY_MODEL") or defaults.memory_model,
        context_window_tokens=int(os.environ.get("SHOPPING_CONTEXT_WINDOW_TOKENS", "131072")),
        context_recent_turns=int(os.environ.get("SHOPPING_CONTEXT_RECENT_TURNS", "4")),
        context_reserve_tokens=int(os.environ.get("SHOPPING_CONTEXT_RESERVE_TOKENS", "4096")),
        context_summary_timeout_s=float(os.environ.get("SHOPPING_CONTEXT_SUMMARY_TIMEOUT_S", "25")),
        search_page_size=int(os.environ.get("SHOPPING_SEARCH_PAGE_SIZE", "6")),
        policy_intent_terms=defaults.policy_intent_terms
        + ("退货", "退款", "保修", "运费", "政策", "换货", "配送费用"),
        policy_intent_cues=defaults.policy_intent_cues
        + ("？", "怎么", "如何", "可以", "多久", "多少", "能否"),
        order_intent_terms=defaults.order_intent_terms + ("订单", "包裹", "物流", "快递"),
        order_intent_cues=defaults.order_intent_cues
        + ("？", "哪里", "到哪", "什么时候", "查询", "取消"),
        # Pydantic rejects a misspelled effort at startup, naming the allowed values.
        thinking_effort=(
            None
            if effort in ("off", "none")
            else cast(ThinkingEffort, effort)
            if effort
            else defaults.thinking_effort
        ),
    )


database = Supabase(SupabaseSettings.from_env())
# "java" uses the commerce service; "json" (the default without a service URL) runs the
# fixtures in-process with carts in memory, for local work and the tests.
_catalog_backend = os.environ.get("CATALOG_BACKEND", "").strip().lower() or (
    "java" if os.environ.get("COMMERCE_SERVICE_URL") else "json"
)
if _catalog_backend not in {"json", "java"}:
    raise ValueError("CATALOG_BACKEND must be json or java")
backend: JavaRetail | MockRetail = (
    JavaRetail.from_env() if _catalog_backend == "java" else MockRetail()
)
agent = ShoppingAgent(
    backend=backend,
    skills_dir=REPO_ROOT / "shopping-agent" / "skills",
    config=build_config(),
    memory_store=SupabaseMemoryStore(database),
)


def product_detail(product: ProductDetails) -> dict:
    # The graph and the agent's detail tool use the same frozen evidence.
    return product.model_dump() | {
        "price_intelligence": backend.price_intelligence(product.product_id),
        "review_aspects": backend.review_aspects(product.product_id),
    }


host = build_experience_host(
    backend=backend,
    agent=agent,
    database=database,
    store=ConversationStore(database),
    product_detail=product_detail,
)
app = host.app


class DirectCartAdd(CartAddRequest):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID  # identifies the tap in the web app's retry logic


@app.post("/api/cart/add")
async def cart_add(request: DirectCartAdd, record: host.CurrentSession) -> dict:
    return await host.direct_add(
        record,
        request,
        note="Customer tapped the add-to-cart button on {title} ({product_id}), quantity {quantity}.",
    )


class OrderLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: str = Field(min_length=1, max_length=80)
    quantity: int = Field(ge=1, le=24)


class SubmitOrder(BaseModel):
    """The checkout card's lines, and the id its button reuses when it retries."""

    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    lines: list[OrderLine] = Field(min_length=1, max_length=100)


# Refusals the card shows as they are; anything else reads as the service being down.
_ORDER_REFUSALS = {"OUT_OF_STOCK", "CART_CHANGED", "CART_EMPTY"}


@app.post("/api/orders")
async def submit_order(request: SubmitOrder, record: host.CurrentSession) -> dict:
    """The checkout card's submit button. The customer places the order here; the model
    has no tool that does. The next turn is told the order was placed."""
    if not isinstance(backend, JavaRetail):
        raise HTTPException(409, "当前为本地演示目录，未连接订单服务，无法提交订单。")
    host.rate_limit(f"order:{record.user_id}", 12)
    try:
        order = await backend.submit_order(
            host.context(record),
            [(line.product_id, line.quantity) for line in request.lines],
            str(request.request_id),
        )
    except CommerceError as error:
        if error.code in _ORDER_REFUSALS:
            raise HTTPException(409, error.detail[:120]) from None
        raise HTTPException(503, "订单服务暂时不可用，请稍后重试。") from None
    except httpx.HTTPError:
        raise HTTPException(503, "订单服务暂时不可用，请稍后重试。") from None
    count = sum(item.quantity for item in order.items)
    record.pending_app_events.append(
        f"Customer submitted order {order.order_id} ({count} item(s)) from the checkout card; "
        "the stock is taken and the cart is now empty."
    )
    return {
        "order": order.model_dump(mode="json"),
        "cart": cart_payload(Cart(currency=order.currency)),
    }
