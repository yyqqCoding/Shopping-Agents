// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useEffect, useState } from "react";
import {
  Greeting,
  greeting,
  HomeSection,
  type Starter,
  Starters,
  useCatalogIndex,
  useStoreFrame,
} from "web-shared";
import { fetchProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import ProductTile from "./ProductTile";

const STARTERS: Starter[] = [
  { icon: "search", prompt: "A tent for a first family camping trip, under $250" },
  { icon: "home", prompt: "Set up a home office in a small spare room for about $800" },
  { icon: "tag", prompt: "Drip or espresso for busy weekday mornings?" },
  { icon: "edit", prompt: "Remember: small apartment, no outdoor storage, and a golden retriever" },
];

/** What the store is featuring: labelled bestseller or new, photographed ones first. */
function featured(catalog: Record<string, Product>): Product[] {
  return Object.values(catalog)
    .filter((product) => product.labels?.some((label) => label === "bestseller" || label === "new") && product.in_stock !== false)
    .sort((a, b) => Number(Boolean(b.image_url)) - Number(Boolean(a.image_url)))
    .slice(0, 4);
}

/** The clock is read after mount, so the prerendered page never disagrees with the browser's day. */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  return now;
}

export default function HomeView({ shopperName }: { shopperName: string }) {
  const { ask } = useStoreFrame();
  const catalog = useCatalogIndex(fetchProducts);
  const picks = featured(catalog);
  const now = useNow();
  return (
    <div className="flex flex-col gap-4">
      <Greeting
        eyebrow={
          <span className="uppercase tracking-[0.14em]">
            {now ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : " "}
          </span>
        }
        title={
          <h1 className="font-display text-[34px] font-medium leading-[1.12] tracking-[-0.01em] text-(--ink)">
            {now ? greeting(now) : "Hello"},{" "}
            <span className="italic text-(--accent-ink)">{shopperName}</span>
          </h1>
        }
      >
        Ask about a product, a project, an order, or a return.
      </Greeting>
      <Starters items={STARTERS} />
      {picks.length ? (
        <HomeSection title="Popular right now" subtitle="Bestsellers and new arrivals; open one to ask about it">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {picks.map((product) => (
              <ProductTile key={product.product_id} product={product} fluid onOpen={(item) => ask(`Tell me about the ${item.title}.`)} />
            ))}
          </div>
        </HomeSection>
      ) : null}
    </div>
  );
}
