// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useCallback, type ReactNode } from "react";
import { ActivityLine, type AgentTurn, type AssistantChatItem, type UISegment, Chat as ChatShell } from "web-shared";
import { addToCart, api } from "@/lib/api";
import type { CartPayload } from "@/lib/types";
import GenerativeBlock from "./generative";
import { ProductTileSkeleton } from "./ProductTile";
import type { Product } from "@/lib/types";

const WIDE_COMPONENTS = new Set(["products", "comparison", "plan"]);
const renderPending = (item: AssistantChatItem) => <Pending item={item} />;

/** Shimmers where the carousel will land while a search runs. */
function Pending({ item }: { item: AssistantChatItem }) {
  const searching = item.tools.includes("search_products") && !item.segments.some((s) => s.type === "ui");
  if (!searching) return <ActivityLine item={item} />;
  return (
    <section role="status" className="product-loading">
      <div className="recommendation-heading">{item.activity ?? "正在查找商品…"}</div>
      <div className="product-loading-grid">
        {[0, 1, 2, 3].map((slot) => (
          <ProductTileSkeleton key={slot} />
        ))}
      </div>
    </section>
  );
}

export default function Chat({ chat, home, onCartUpdate }: { chat: AgentTurn; home: ReactNode; onCartUpdate: (cart: CartPayload) => void }) {
  const onAdd = useCallback(async (product: Product) => {
    const conversationId = api.session;
    const cart = await addToCart(product.product_id);
    if (cart && api.session === conversationId) onCartUpdate(cart);
    return cart !== null;
  }, [onCartUpdate]);
  const renderBlock = useCallback((segment: UISegment) => (
    <GenerativeBlock block={segment.block} status={segment.status} onAdd={onAdd} onSubmitted={onCartUpdate} />
  ), [onAdd, onCartUpdate]);
  return (
    <ChatShell
      chat={chat}
      wide={WIDE_COMPONENTS}
      home={home}
      renderPending={renderPending}
      renderBlock={renderBlock}
    />
  );
}
