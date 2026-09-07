# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The assistant API: the full shopping agent over the mock catalog in ``data/``,
hosted for a chat-only page.

    uvicorn assistant.api.main:app --app-dir examples --port 8004

Supabase verifies anonymous visitors and stores conversations, carts and memory.
Product fixtures and existing photos remain in data/ and the web app's public/products.
"""

from __future__ import annotations

import os
from typing import cast
from uuid import UUID

from pydantic import ConfigDict

from commerce_common.config import ThinkingEffort
from demo_common import (
    REPO_ROOT,
    CartAddRequest,
    load_demo_env,
)
from demo_common.experience import build_experience_host
from demo_common.persistence import (
    CART_OPERATION,
    ConversationStore,
    PersistentCarts,
    SupabaseMemoryStore,
)
from demo_common.supabase import Supabase, SupabaseSettings
from shopping_agent import ProductDetails, ShoppingAgentConfig
from shopping_agent_runtime import ShoppingAgent

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
        brand_name="ACME",
        assistant_name="ACME 购物助手",
        brand_voice=(
            "使用简体中文，专业、自然、简洁。所有回复、卡片标题、推荐理由、追问和工具进度均使用中文。"
            "保留商品 ID、ACME 品牌名和币种；价格以美元展示，不做汇率换算。"
            "这是虚构商品的购物体验，结算不创建真实订单。"
            "静默应用偏好，不展示记忆状态，不说已记住或正在读取记忆。"
        ),
        domain_search_notes="支持中文关键词，category 使用商品记录中的稳定分类 ID。硬性条件不满足时说明差异。",
        product_id_patterns=(r"(?<![A-Z0-9_-])AR-\d{4}(?:-[A-Z0-9]+)*(?![A-Z0-9_-])",),
        model=os.environ.get("SHOPPING_MODEL") or defaults.model,
        memory_model=os.environ.get("SHOPPING_MEMORY_MODEL") or defaults.memory_model,
        context_window_tokens=int(os.environ.get("SHOPPING_CONTEXT_WINDOW_TOKENS", "131072")),
        context_recent_turns=int(os.environ.get("SHOPPING_CONTEXT_RECENT_TURNS", "4")),
        context_reserve_tokens=int(os.environ.get("SHOPPING_CONTEXT_RESERVE_TOKENS", "4096")),
        context_summary_timeout_s=float(os.environ.get("SHOPPING_CONTEXT_SUMMARY_TIMEOUT_S", "25")),
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
backend = MockRetail(cart_store=PersistentCarts(database))
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
    request_id: UUID


@app.post("/api/cart/add")
async def cart_add(request: DirectCartAdd, record: host.CurrentSession) -> dict:
    token = CART_OPERATION.set(str(request.request_id))
    try:
        return await host.direct_add(
            record,
            request,
            note="Customer tapped the add-to-cart button on {title} ({product_id}), quantity {quantity}.",
        )
    finally:
        CART_OPERATION.reset(token)
