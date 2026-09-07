// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useRef, useState } from "react";
import { hasOptions, optionSummary, optionValuesLabel, priceLabel, useStoreFrame } from "web-shared";
import type { Product } from "@/lib/types";
import { flyToCart } from "@/lib/flight";
import { attributeChips, productGlyph, productTileClass } from "@/lib/format";
import { STORE_POLICY } from "@/lib/storePolicy";

/** A trailing parenthetical such as "(48-Pack)" is kept unbreakable so the clamp cuts before it. */
export function ProductTitle({ title, className = "" }: { title: string; className?: string }) {
  const match = /^(.*\S)\s+(\([^()]+\))$/.exec(title);
  return (
    <div className={className} title={title}>
      {match ? (
        <>
          {match[1]} <span className="whitespace-nowrap">{match[2]}</span>
        </>
      ) : (
        title
      )}
    </div>
  );
}

function ReturnsPromise({ className = "" }: { className?: string }) {
  return (
    <div className={`text-[11px] text-(--ink-soft) ${className}`}>
      {STORE_POLICY.returnsShort}
    </div>
  );
}

export function ProductImage({ product, className = "" }: { product: Product; className?: string }) {
  if (product.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.image_url} alt={product.title} className={`object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center text-5xl ${productTileClass(product.product_id)} ${className}`}
      aria-hidden
    >
      {productGlyph(product)}
    </div>
  );
}

/** `attributes.delivery` is stamped by the backend. */
export function DeliveryPromise({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const promise = product.attributes?.delivery;
  if (!promise || product.in_stock === false) return null;
  return (
    <div className={`text-[11px] font-medium text-(--ok) ${className}`}>{promise}</div>
  );
}

/** `attributes.low_stock` is the inventory count the merchant portal shows. */
function LowStockChip({ product, className = "" }: { product: Product; className?: string }) {
  const count = product.attributes?.low_stock;
  if (!count || product.in_stock === false) return null;
  return (
    <span
      className={`whitespace-nowrap rounded-full bg-(--warn-soft) px-2 py-0.5 text-[11px] font-semibold text-(--warn) ${className}`}
    >
      仅剩 {count} 件
    </span>
  );
}

export function Rating({ rating, count }: { rating?: number | null; count?: number | null }) {
  if (rating == null) return null;
  // A one-line rating keeps sibling cards' price rows aligned.
  return (
    <span className="whitespace-nowrap text-[13px] text-(--ink-soft)">
      <span className="text-(--star)">★</span> {rating.toFixed(1)}
      {count ? (
        <span className="text-[11px] text-(--ink-soft)/80"> ({count.toLocaleString()})</span>
      ) : null}
    </span>
  );
}

/** What a variant chose, or what a product with options still needs chosen; empty otherwise. */
function optionText(product: Product): string {
  return optionValuesLabel(product) || optionSummary(product);
}

export function OptionLine({ product, className = "" }: { product: Product; className?: string }) {
  const text = optionText(product);
  if (!text) return null;
  return <div className={`truncate text-[11px] text-(--ink-soft) ${className}`}>{text}</div>;
}

/**
 * An onAdd that resolves `false` means the server rejected the write. A product with options
 * is not added from the card: the button hands the choice to the assistant, which settles the
 * option with the customer and adds the variant.
 */
export function AddButton({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: (product: Product) => boolean | void | Promise<boolean | void>;
}) {
  const [phase, setPhase] = useState<"idle" | "busy" | "done" | "error">("idle");
  const adding = useRef(false);
  const { ask, chat } = useStoreFrame();
  const disabled = !!chat && (!chat.ready || chat.busy);
  if (hasOptions(product)) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          ask(`帮我选择${product.title}（${product.product_id}）的规格，再加入购物车。`);
        }}
        aria-label={`选择${product.title}的规格`}
        className="pointer-events-auto absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-(--ink) text-lg font-semibold leading-none text-(--surface) shadow-(--shadow-sm) transition-all hover:scale-105"
      >
        +
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled || phase !== "idle"}
      onClick={async (event) => {
        event.stopPropagation();
        if (disabled || adding.current || phase !== "idle") return;
        adding.current = true;
        const source = event.currentTarget.parentElement ?? event.currentTarget;
        setPhase("busy");
        let added = false;
        try { added = (await onAdd(product)) !== false; }
        catch { added = false; }
        finally { adding.current = false; }
        setPhase(added ? "done" : "error");
        // Animate only after the server confirmed the write.
        if (added) flyToCart(product, source);
        window.setTimeout(() => setPhase("idle"), added ? 1200 : 1600);
      }}
      aria-label={`将${product.title}加入购物车`}
      title={phase === "error" ? "暂时未能加入购物车，请重试。" : "加入购物车"}
      className={`pointer-events-auto absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold leading-none text-(--surface) shadow-(--shadow-sm) transition-all hover:scale-110 hover:bg-(--accent-strong) active:scale-95 ${
        phase === "done" ? "bg-(--ok)" : phase === "error" ? "bg-(--warn)" : "bg-(--ink)"
      } ${phase === "busy" ? "animate-pulse" : ""}`}
    >
      {phase === "done" ? "✓" : phase === "error" ? "!" : "+"}
    </button>
  );
}

export default function ProductTile({
  product,
  compact = false,
  fluid = false,
  selected = false,
  onAdd,
  onOpen,
}: {
  product: Product;
  compact?: boolean;
  /** Fills its grid cell instead of the carousel's fixed width. */
  fluid?: boolean;
  selected?: boolean;
  onAdd?: (product: Product) => boolean | void | Promise<boolean | void>;
  onOpen?: (product: Product) => void;
}) {
  const clickable = Boolean(onOpen);
  const chips = compact ? [] : attributeChips(product);
  const imageHeight = compact ? "h-16" : fluid ? "h-28" : "h-24";
  return (
    <div
      className={`group relative flex shrink-0 flex-col overflow-hidden rounded-2xl border bg-(--card) shadow-(--shadow-sm) transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
        fluid ? "w-full" : compact ? "w-36" : "w-48"
      } ${selected ? "border-(--ink)" : "border-(--line)"}`}
    >
      <div
        onClick={clickable ? () => onOpen?.(product) : undefined}
        onKeyDown={clickable ? (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen?.(product); }
        } : undefined}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        className={`flex flex-1 flex-col rounded-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) ${
          clickable ? "cursor-pointer" : ""
        }`}
      >
        <div className="relative overflow-hidden">
          <ProductImage
            product={product}
            className={`w-full ${imageHeight} transition-transform duration-500 ease-out group-hover:scale-[1.04]`}
          />
          {product.in_stock === false ? (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-(--ink)/85 px-2 py-0.5 text-[11px] font-medium text-(--surface)">
              暂时缺货
            </span>
          ) : (
            <LowStockChip product={product} className="absolute right-1.5 top-1.5" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-(--ink-soft)/80">{product.brand}</div>
          <ProductTitle
            title={product.title}
            className={`line-clamp-2 text-[13px] font-medium leading-snug ${compact ? "" : "h-9"}`}
          />
          {compact ? null : optionText(product) ? (
            <OptionLine product={product} className="h-[18px] pt-0.5 leading-4" />
          ) : (
            /* Fixed height keeps sibling cards aligned. */
            <div className="flex h-[18px] flex-wrap gap-1 overflow-hidden pt-0.5" aria-hidden={chips.length === 0}>
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="whitespace-nowrap rounded-full bg-(--well) px-1.5 py-px text-[11px] leading-4 text-(--ink-soft)"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between gap-1 pt-0.5">
            <span className="text-sm font-semibold">{priceLabel(product)}</span>
            <Rating rating={product.rating} count={compact ? undefined : product.review_count} />
          </div>
          <DeliveryPromise product={product} />
          {!compact && product.in_stock !== false ? <ReturnsPromise /> : null}
        </div>
      </div>
      {onAdd && product.in_stock !== false ? (
        // Over the image but a sibling of the clickable area, so one control is not nested in another.
        <div className={`pointer-events-none absolute inset-x-0 top-0 ${imageHeight}`}>
          <AddButton product={product} onAdd={onAdd} />
        </div>
      ) : null}
    </div>
  );
}

export function ProductRow({
  product,
  onAdd,
}: {
  product: Product;
  onAdd?: (product: Product) => boolean | void | Promise<boolean | void>;
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-(--line) bg-(--card) p-2 shadow-(--shadow-sm) transition-shadow hover:shadow-md">
      <div className="relative shrink-0">
        <ProductImage
          product={product}
          className={`h-14 w-16 rounded-lg ${product.in_stock === false ? "opacity-50" : ""}`}
        />
        {onAdd && product.in_stock !== false ? (
          <AddButton product={product} onAdd={onAdd} />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-(--ink-soft)/80">{product.brand}</div>
        <ProductTitle
          title={product.title}
          className="line-clamp-1 text-[13px] font-medium leading-snug"
        />
        <OptionLine product={product} />
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{priceLabel(product)}</span>
          <Rating rating={product.rating} />
          {product.in_stock === false ? (
            <span className="rounded-full bg-(--ink)/85 px-2 py-0.5 text-[11px] font-medium text-(--surface)">
              暂时缺货
            </span>
          ) : (
            <LowStockChip product={product} />
          )}
        </div>
        <DeliveryPromise product={product} />
      </div>
    </div>
  );
}
