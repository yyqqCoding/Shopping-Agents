// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useRef, useState } from "react";
import {
  hasOptions,
  optionSummary,
  optionValuesLabel,
  priceLabel,
  useStoreFrame,
} from "web-shared";
import type { Product } from "@/lib/types";
import { flyToCart } from "@/lib/flight";
import { attributeChips } from "@/lib/format";
import EquipmentIllustration from "./EquipmentIllustration";

/** A trailing parenthetical such as "(48-Pack)" is kept unbreakable so the clamp cuts before it. */
export function ProductTitle({
  title,
  className = "",
}: {
  title: string;
  className?: string;
}) {
  const match = /^(.*\S)\s+(\([^()]+\))$/.exec(title);
  return (
    <span className={className} title={title}>
      {match ? (
        <>
          {match[1]} <span className="whitespace-nowrap">{match[2]}</span>
        </>
      ) : (
        title
      )}
    </span>
  );
}

export function ProductImage({
  product,
  className = "",
  priority = false,
  sizes = "(max-width: 760px) 45vw, 320px",
}: {
  product: Product;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // Restored outdoor messages may predate photography; legacy AR records retain their URLs.
  const outdoorId = /^(OD-\d{4})(?:-|$)/.exec(
    product.variant_of ?? product.product_id,
  )?.[1];
  const imageUrl =
    product.image_url ||
    (outdoorId ? `/products/generated/${outdoorId}.webp` : null);
  if (imageUrl && failedUrl !== imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imageUrl}
        srcSet={
          imageUrl.startsWith("/products/generated/") &&
          imageUrl.endsWith(".webp")
            ? `${imageUrl.replace(/\.webp$/, "-480.webp")} 480w, ${imageUrl} 1024w`
            : undefined
        }
        sizes={sizes}
        alt={product.title}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onError={() => setFailedUrl(imageUrl)}
        className={`product-photograph object-contain ${className}`}
      />
    );
  }
  return (
    <div className={`equipment-placeholder ${className}`} aria-hidden>
      <EquipmentIllustration category={product.category} />
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
    <div className={`text-[13px] font-medium text-(--ok) ${className}`}>
      {promise}
    </div>
  );
}

/** `attributes.low_stock` is the inventory count the merchant portal shows. */
function LowStockChip({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const count = product.attributes?.low_stock;
  if (!count || product.in_stock === false) return null;
  return (
    <span
      className={`whitespace-nowrap rounded-full bg-(--warn-soft) px-2 py-0.5 text-[13px] font-semibold text-(--warn) ${className}`}
    >
      仅剩 {count} 件
    </span>
  );
}

export function Rating({
  rating,
  count,
}: {
  rating?: number | null;
  count?: number | null;
}) {
  if (rating == null) return null;
  // A one-line rating keeps sibling cards' price rows aligned.
  return (
    <span className="whitespace-nowrap text-[15px] text-(--ink-soft)">
      <span className="text-(--star)">★</span> {rating.toFixed(1)}
      {count ? (
        <span className="text-[13px] text-(--ink-soft)/80">
          {" "}
          ({count.toLocaleString()})
        </span>
      ) : null}
    </span>
  );
}

/** What a variant chose, or what a product with options still needs chosen; empty otherwise. */
function optionText(product: Product): string {
  return optionValuesLabel(product) || optionSummary(product);
}

export function OptionLine({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const text = optionText(product);
  if (!text) return null;
  return (
    <div className={`truncate text-[13px] text-(--ink-soft) ${className}`}>
      {text}
    </div>
  );
}

/**
 * An onAdd that resolves `false` means the server rejected the write. A product with options
 * is not added from the card: the button hands the choice to the assistant, which settles the
 * option with the customer and adds the variant.
 */
export function AddButton({
  product,
  onAdd,
  appearance = "icon",
}: {
  product: Product;
  onAdd: (product: Product) => boolean | void | Promise<boolean | void>;
  appearance?: "icon" | "label";
}) {
  const [phase, setPhase] = useState<"idle" | "busy" | "done" | "error">("idle");
  const adding = useRef(false);
  const { ask, chat } = useStoreFrame();
  const disabled = !!chat && (!chat.ready || chat.busy);
  const className = `product-add-button product-add-${appearance}`;
  const optionLabel = Object.keys(product.options ?? {}).some((key) =>
    /尺码|size/i.test(key),
  )
    ? "选择尺码"
    : "选择规格";
  if (hasOptions(product)) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          ask(
            `帮我选择${product.title}（${product.product_id}）的规格，再加入购物车。`,
          );
        }}
        aria-label={`${optionLabel}：${product.title}`}
        className={className}
      >
        {appearance === "label" ? <span>{optionLabel}</span> : null}
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m7 4 6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
        const source =
          event.currentTarget
            .closest(".chat-product-tile, .product-row")
            ?.querySelector<HTMLElement>(".product-tile-media") ??
          event.currentTarget.parentElement ??
          event.currentTarget;
        setPhase("busy");
        let added = false;
        try {
          added = (await onAdd(product)) !== false;
        } catch {
          added = false;
        } finally {
          adding.current = false;
        }
        setPhase(added ? "done" : "error");
        // Animate only after the server confirmed the write.
        if (added) flyToCart(source);
        window.setTimeout(() => setPhase("idle"), added ? 1200 : 1600);
      }}
      aria-label={
        phase === "done"
          ? `${product.title}已加入购物车`
          : phase === "error"
            ? `${product.title}未能加入购物车`
            : `将${product.title}加入购物车`
      }
      aria-busy={phase === "busy"}
      title={phase === "error" ? "暂时未能加入购物车，请重试。" : "加入购物车"}
      className={className}
      data-phase={phase}
    >
      {appearance === "label" ? (
        <span aria-live="polite">
          {phase === "done"
            ? "已加入"
            : phase === "error"
              ? "未能加入"
              : phase === "busy"
                ? "加入中"
                : "加入购物车"}
        </span>
      ) : null}
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d={
            phase === "done"
              ? "m4 10 4 4 8-8"
              : phase === "error"
                ? "M10 4v7m0 4v1"
                : "M4 10h12M10 4v12"
          }
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export default function ProductTile({
  product,
  compact = false,
  fluid = false,
  horizontal = false,
  selected = false,
  hideDelivery = false,
  reason,
  onAdd,
  onOpen,
}: {
  product: Product;
  compact?: boolean;
  /** Fills its grid cell instead of the carousel's fixed width. */
  fluid?: boolean;
  horizontal?: boolean;
  selected?: boolean;
  hideDelivery?: boolean;
  reason?: string | null;
  onAdd?: (product: Product) => boolean | void | Promise<boolean | void>;
  onOpen?: (product: Product) => void;
}) {
  const chips = compact ? [] : [...new Set(attributeChips(product))].slice(0, 2);
  const selectedOptions = optionValuesLabel(product);
  const picture = (
    <ProductImage
      product={product}
      className="product-tile-photo"
      sizes={horizontal ? "200px" : "280px"}
    />
  );
  return (
    <article
      className={`chat-product-tile ${horizontal ? "product-tile-horizontal" : ""}`}
      data-fluid={fluid}
      data-compact={compact}
      data-selected={selected}
    >
      <div className="product-tile-media">
        {onOpen ? (
          <button
            type="button"
            className="product-tile-image-button"
            onClick={() => onOpen(product)}
            aria-label={`查看${product.title}详情`}
            aria-expanded={selected}
          >
            {picture}
          </button>
        ) : (
          picture
        )}
        {product.in_stock === false ? (
          <span className="product-stock-label">
            {product.attributes?.retired === "true" ? "已下架" : "暂时缺货"}
          </span>
        ) : (
          <LowStockChip product={product} className="product-stock-label" />
        )}
      </div>
      <div className="product-tile-copy">
        {product.brand ? (
          <div className="product-tile-brand">{product.brand}</div>
        ) : null}
        {onOpen ? (
          <button
            type="button"
            className="product-tile-title-button"
            onClick={() => onOpen(product)}
            aria-expanded={selected}
          >
            <ProductTitle title={product.title} className="product-tile-title" />
          </button>
        ) : (
          <ProductTitle title={product.title} className="product-tile-title" />
        )}
        <div className="product-tile-price">{priceLabel(product)}</div>
        {reason ? (
          <p className="product-tile-reason" title={reason}>{reason}</p>
        ) : null}
        {chips.length ? (
          <div className="product-tile-attributes">
            {chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        ) : null}
        {selectedOptions ? (
          <p className="product-tile-options">{selectedOptions}</p>
        ) : null}
        {!hideDelivery ? (
          <DeliveryPromise product={product} className="product-tile-delivery" />
        ) : null}
        <div className="product-tile-actions">
          {onOpen ? (
            <button
              type="button"
              className="product-detail-action tactical-inspect-action"
              onClick={() => onOpen(product)}
              aria-expanded={selected}
            >
              <span>查看详情</span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
            </button>
          ) : product.rating != null ? (
            <Rating rating={product.rating} />
          ) : null}
          {onAdd && product.in_stock !== false ? (
            <AddButton product={product} onAdd={onAdd} appearance="label" />
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Uses the same media and text columns as a delivered recommendation. */
export function ProductTileSkeleton() {
  return (
    <div className="product-tile-skeleton" aria-hidden="true">
      <div className="ac-skeleton product-skeleton-image" />
      <div className="product-skeleton-copy">
        <div className="ac-skeleton product-skeleton-title" />
        <div className="ac-skeleton product-skeleton-price" />
        <div className="ac-skeleton product-skeleton-line" />
        <div className="ac-skeleton product-skeleton-line" />
        <div className="ac-skeleton product-skeleton-action" />
      </div>
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
    <div className="product-row">
      <div className="product-tile-media">
        <ProductImage
          product={product}
          className={`product-row-photo ${product.in_stock === false ? "opacity-50" : ""}`}
        />
      </div>
      <div className="product-row-copy">
        {product.brand ? (
          <div className="product-tile-brand">{product.brand}</div>
        ) : null}
        <ProductTitle title={product.title} className="product-tile-title" />
        <OptionLine product={product} />
        <div className="product-row-price">
          <span>{priceLabel(product)}</span>
          {product.in_stock === false ? (
            <span className="product-unavailable">
              {product.attributes?.retired === "true" ? "已下架" : "暂时缺货"}
            </span>
          ) : (
            <LowStockChip product={product} />
          )}
        </div>
        <DeliveryPromise product={product} />
      </div>
      {onAdd && product.in_stock !== false ? (
        <AddButton product={product} onAdd={onAdd} appearance="label" />
      ) : null}
    </div>
  );
}
