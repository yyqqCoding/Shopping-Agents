// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import type { ReactNode } from "react";
import { ActivityLine, type AgentTurn, type AssistantChatItem, Chat as ChatShell } from "web-shared";
import { addToCart, api } from "@/lib/api";
import type { CartPayload } from "@/lib/types";
import GenerativeBlock from "./generative";
import { ProductTileSkeleton } from "./ProductTile";

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
  return (
    <ChatShell
      chat={chat}
      wide={new Set(["products", "comparison", "plan"])}
      home={home}
      renderPending={(item) => <Pending item={item} />}
      renderBlock={(segment) => (
        <GenerativeBlock
          block={segment.block}
          status={segment.status}
          onAdd={async (product) => {
            const conversationId = api.session;
            const cart = await addToCart(product.product_id);
            if (cart && api.session === conversationId) onCartUpdate(cart);
            return cart !== null;
          }}
        />
      )}
    />
  );
}
