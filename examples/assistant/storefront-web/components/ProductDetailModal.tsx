"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  formatMoney,
  optionValuesLabel,
  priceLabel,
  useStoreFrame,
} from "web-shared";
import { fetchProduct } from "@/lib/api";
import type {
  PriceIntelligence,
  Product,
  ProductDetails,
  ReviewAspects,
} from "@/lib/types";
import { ProductImage, Rating, DeliveryPromise } from "./ProductTile";
import { flyToCart } from "@/lib/flight";

export interface ProductDetailModalProps {
  product: Product | null;
  reason?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onAdd?: (product: Product) => boolean | void | Promise<boolean | void>;
}

export default function ProductDetailModal({
  product,
  reason,
  isOpen,
  onClose,
  onAdd,
}: ProductDetailModalProps) {
  const [details, setDetails] = useState<ProductDetails | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [addPhase, setAddPhase] = useState<"idle" | "busy" | "done" | "error">("idle");
  const modalRef = useRef<HTMLDivElement>(null);
  const { ask, chat } = useStoreFrame();

  // Fetch full details when opened
  useEffect(() => {
    if (!isOpen || !product) {
      setDetails(null);
      setSelectedVariantId(null);
      return;
    }

    let mounted = true;
    setLoading(true);

    void fetchProduct(product.product_id).then((result) => {
      if (mounted) {
        setDetails(result);
        setLoading(false);
        if (result?.variants?.length) {
          const matched = result.variants.find((v) => v.in_stock !== false);
          if (matched) setSelectedVariantId(matched.product_id);
        }
      }
    });

    return () => {
      mounted = false;
    };
  }, [isOpen, product?.product_id]);

  // Lock body scroll & listen to Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  const full = details ?? product;
  const activeVariant = details?.variants?.find((v: Product) => v.product_id === selectedVariantId);
  const activeProduct = activeVariant ? { ...full, ...activeVariant } : full;
  const specs = details?.specs ?? {};
  const inStock = activeProduct.in_stock !== false;
  const isChatBusy = !!chat && (!chat.ready || chat.busy);

  const handleAddToCart = async (e: React.MouseEvent) => {
    if (!onAdd || !inStock || addPhase !== "idle") return;
    setAddPhase("busy");

    try {
      const success = (await onAdd(activeProduct)) !== false;
      setAddPhase(success ? "done" : "error");
      if (success) {
        const target = e.currentTarget as HTMLElement;
        flyToCart(target);
      }
    } catch {
      setAddPhase("error");
    } finally {
      window.setTimeout(() => setAddPhase("idle"), 1600);
    }
  };

  const handleAskAssistant = () => {
    ask(`我想深入了解${full.title}（${activeProduct.product_id}），它的适用场景、优缺点和使用建议是什么？`);
    onClose();
  };

  return (
    <div
      className="tactical-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-modal="true"
      role="dialog"
    >
      <div className="tactical-modal-dialog" ref={modalRef}>
        {/* Top Tactical Window Bar */}
        <div className="modal-tactical-header">
          <div className="modal-header-left">
            <span className="modal-beacon" />
            <span className="modal-code">GEAR TELEMETRY // {activeProduct.product_id}</span>
            <span className="modal-cat">{full.attributes?.category_label || "EQUIPMENT"}</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="关闭商品详情弹窗"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="modal-tactical-body">
          {/* Left Column: Tactical Media Viewport */}
          <div className="modal-media-col">
            <div className="modal-photo-stage">
              <div className="laser-scanner" aria-hidden="true" />
              <div className="tactical-brackets" aria-hidden="true">
                <span className="bracket tl" />
                <span className="bracket tr" />
                <span className="bracket bl" />
                <span className="bracket br" />
              </div>
              <ProductImage
                product={activeProduct}
                priority
                className="modal-photo-img"
                sizes="(max-width: 768px) 90vw, 420px"
              />
              <div className="card-liquid-sheen" aria-hidden="true" />
            </div>

            {/* In-Stock & Delivery Guarantee */}
            <div className="modal-stock-row">
              <span className={`modal-stock-pill ${inStock ? "in-stock" : "out-of-stock"}`}>
                {inStock ? "● 现货就绪，可随时装配" : "✕ 暂时售罄"}
              </span>
              <DeliveryPromise product={activeProduct} className="modal-delivery" />
            </div>
          </div>

          {/* Right Column: Specifications & Actions */}
          <div className="modal-info-col">
            {full.brand ? <div className="modal-brand-tag">{full.brand}</div> : null}
            <h2 className="modal-title">{full.title}</h2>

            <div className="modal-price-row">
              <div className="modal-price">
                ¥{activeProduct.price.toLocaleString("zh-CN")}
                {full.options && !selectedVariantId ? <small>起</small> : null}
              </div>
              <Rating rating={full.rating} count={full.review_count} />
            </div>

            {/* AI Recommendation Reason */}
            {reason ? (
              <div className="modal-reason-box">
                <span className="reason-label">推荐匹配依据：</span>
                <p>{reason}</p>
              </div>
            ) : null}

            {/* Description */}
            {full.short_description || details?.long_description ? (
              <p className="modal-desc">
                {full.short_description || details?.long_description}
              </p>
            ) : null}

            {/* Variant Selector */}
            {details?.variants?.length ? (
              <div className="modal-variants-section">
                <div className="variants-label">选择规格 / 尺码：</div>
                <div className="variants-pills">
                  {details.variants.map((v: Product) => {
                    const label = optionValuesLabel(v) || v.title;
                    const isSelected = v.product_id === selectedVariantId;
                    const available = v.in_stock !== false;
                    return (
                      <button
                        key={v.product_id}
                        type="button"
                        disabled={!available}
                        aria-pressed={isSelected}
                        className={`variant-pill ${isSelected ? "is-selected" : ""}`}
                        onClick={() => setSelectedVariantId(v.product_id)}
                      >
                        <span>{label}</span>
                        {!available ? <small>缺货</small> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Full Specs Table */}
            {Object.keys(specs).length ? (
              <div className="modal-specs-section">
                <div className="specs-section-title">工程与材料参数</div>
                <dl className="modal-specs-grid">
                  {Object.entries(specs).map(([k, v]) => (
                    <div key={k} className="spec-tile">
                      <dt>{k.replaceAll("_", " ")}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : loading ? (
              <div className="modal-loading-notice">
                <span className="beacon-dot" /> 正在加载工程深度参数…
              </div>
            ) : null}

            {/* Action Buttons */}
            <div className="modal-actions-dock">
              {onAdd && inStock ? (
                <button
                  type="button"
                  className="modal-primary-add-btn"
                  onClick={handleAddToCart}
                  disabled={addPhase !== "idle"}
                >
                  {addPhase === "busy" ? (
                    "正在装配…"
                  ) : addPhase === "done" ? (
                    "✓ 已加入购物车"
                  ) : addPhase === "error" ? (
                    "加入失败，请重试"
                  ) : (
                    <>
                      <span>直接加入购物车</span>
                      <span className="btn-price-addon">
                        ¥{activeProduct.price.toLocaleString("zh-CN")}
                      </span>
                    </>
                  )}
                </button>
              ) : null}

              <button
                type="button"
                className="modal-ask-btn"
                disabled={isChatBusy}
                onClick={handleAskAssistant}
              >
                <span>向助理询问此装备</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
