# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The assistant API: the full shopping agent over the mock catalog in ``data/``,
hosted for a chat-only page.

    uvicorn assistant.api.main:app --app-dir examples --port 8004

Every route is demo_common's shared storefront host plus the direct add-to-cart button;
memory is file-backed (``data/.memory-store.json``, gitignored) and seeded once per user
from ``data/memory-seed.json``. Product photos live in the web app's ``public/products``.
"""

from __future__ import annotations

import os
from typing import cast

from commerce_common.config import ThinkingEffort
from commerce_common.memory import JsonFileMemoryStore
from demo_common import (
    REPO_ROOT,
    CartAddRequest,
    MemorySeeder,
    build_storefront_host,
    load_demo_env,
)
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
        assistant_name="ACME Assistant",
        brand_voice="professional, warm, and brief",
        model=os.environ.get("SHOPPING_MODEL") or defaults.model,
        memory_model=os.environ.get("SHOPPING_MEMORY_MODEL") or defaults.memory_model,
        # Pydantic rejects a misspelled effort at startup, naming the allowed values.
        thinking_effort=(
            None
            if effort in ("off", "none")
            else cast(ThinkingEffort, effort)
            if effort
            else defaults.thinking_effort
        ),
    )


backend = MockRetail()
agent = ShoppingAgent(
    backend=backend,
    skills_dir=REPO_ROOT / "shopping-agent" / "skills",
    config=build_config(),
    memory_store=JsonFileMemoryStore(DATA_DIR / ".memory-store.json"),
)


def product_detail(product: ProductDetails) -> dict:
    # Detail-panel enrichment only; the agent's tool results never carry it.
    return product.model_dump() | {
        "price_intelligence": backend.price_intelligence(product.product_id),
        "review_aspects": backend.review_aspects(product.product_id),
    }


host = build_storefront_host(
    title="ACME Assistant demo API",
    example_root=EXAMPLE_ROOT,
    backend=backend,
    agent=agent,
    memory_seeder=MemorySeeder(
        DATA_DIR / "memory-seed.json", marker=DATA_DIR / ".memory-seeded.json"
    ),
    product_detail=product_detail,
)
app = host.app


@app.post("/api/cart/add")
async def cart_add(request: CartAddRequest, record: host.CurrentSession) -> dict:
    return await host.direct_add(
        record,
        request,
        note="Customer tapped the add-to-cart button on {title} ({product_id}), quantity {quantity}.",
    )
