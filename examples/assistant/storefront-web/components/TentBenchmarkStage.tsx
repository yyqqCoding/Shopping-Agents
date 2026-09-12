"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { Arrow } from "./SiteChrome";
import { GearPrint } from "./LandingExperience";

interface TentBenchmarkStageProps {
  products: ProductDetails[];
}

/**
 * Lando-style dual benchmark: ON RIDGE vs IN CAMP.
 * Editorial pill switcher, oversized watermark typography and a soft
 * brush mask that follows the pointer over each tent print.
 */
export function TentBenchmarkStage({ products }: TentBenchmarkStageProps) {
  const [activeMode, setActiveMode] = useState<"ridge" | "camp">("ridge");
  const [reduced, setReduced] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Pointer-driven brush: write CSS vars directly, never re-render.
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    if (reduced) return;
    const wrap = cardRefs.current[id];
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    wrap.style.setProperty("--brush-x", `${e.clientX - rect.left}px`);
    wrap.style.setProperty("--brush-y", `${e.clientY - rect.top}px`);
    wrap.style.setProperty("--brush-on", "1");
  };

  const handleCardMouseLeave = (id: string) => {
    const wrap = cardRefs.current[id];
    if (!wrap) return;
    wrap.style.setProperty("--brush-on", "0");
  };

  const ridgeProd = products.find((p) => p.product_id === "OD-1001") || products[0];
  const campProd = products.find((p) => p.product_id === "OD-1002") || products[1];

  return (
    <div className="lando-dual-benchmark">
      {/* Oversized watermark typography behind the stage */}
      <div className="lando-watermark-bg" aria-hidden="true" data-mode={activeMode}>
        <span className="watermark-bold">{activeMode === "ridge" ? "ON RIDGE" : "IN CAMP"}</span>
        <span className="watermark-script">
          {activeMode === "ridge" ? "Ultralight // 1850g" : "Spacious // 3200g"}
        </span>
      </div>

      {/* Header: editorial headline + dual-mode pill switcher */}
      <div className="lando-benchmark-header">
        <div className="lando-headline-col">
          <div className="lando-kicker">
            <span className="kicker-index">DUAL FIELD STUDY</span>
            <span className="kicker-sep">//</span>
            <span className="kicker-theme">WEIGHT VS VOLUME</span>
          </div>
          <h2 data-reveal className="lando-title">
            轻一点，
            <br />
            还是宽敞一点？
          </h2>
          <p data-reveal className="lando-subtitle">
            两顶旗舰帐篷的极致取舍。是背负 1.85kg 疾行于山脊，还是享受 +35% 舒展空间的营地漫夜。
          </p>
        </div>

        <div className="lando-mode-switcher" data-reveal role="group" aria-label="切换对比焦点">
          <button
            type="button"
            className={`mode-pill ${activeMode === "ridge" ? "is-active" : ""}`}
            onClick={() => setActiveMode("ridge")}
          >
            <span className="pill-dot" />
            <span className="pill-text">ON RIDGE · 极致超轻</span>
            <span className="pill-metric">1,850 g</span>
          </button>
          <button
            type="button"
            className={`mode-pill ${activeMode === "camp" ? "is-active" : ""}`}
            onClick={() => setActiveMode("camp")}
          >
            <span className="pill-dot" />
            <span className="pill-text">IN CAMP · 宽居营地</span>
            <span className="pill-metric">3,200 g</span>
          </button>
        </div>
      </div>

      {/* Staggered editorial cards */}
      <div className="lando-cards-stage">
        <div
          ref={(el) => {
            cardRefs.current["OD-1001"] = el;
          }}
          className={`lando-tent-card ${activeMode === "ridge" ? "is-focused" : "is-subdued"}`}
          onMouseEnter={() => setActiveMode("ridge")}
          onMouseMove={(e) => handleCardMouseMove(e, "OD-1001")}
          onMouseLeave={() => handleCardMouseLeave("OD-1001")}
        >
          <div className="lando-card-photo-wrap">
            <div className="lando-brush-mask" aria-hidden="true" />
            <div className="lando-card-badge">
              <span className="badge-tag">ROUTE 01 · 疾步穿越</span>
              <strong className="badge-highlight">-1,350 g（轻 42%）</strong>
            </div>
            <GearPrint product={ridgeProd} tilt={-1.5} index={0} />
          </div>

          <div className="paper lando-card-spec-sheet" data-reveal>
            <div className="spec-sheet-header">
              <h3>
                <Link href={`/equipment/${ridgeProd.product_id}`}>{ridgeProd.title}</Link>
              </h3>
              <span className="spec-price">
                ¥{ridgeProd.price.toLocaleString("zh-CN")}
              </span>
            </div>
            <div className="spec-metrics-strip">
              <div className="metric-cell">
                <span className="cell-label">打包重量</span>
                <strong className="cell-val orange">1.85 kg</strong>
              </div>
              <div className="metric-cell">
                <span className="cell-label">展开宽度</span>
                <strong className="cell-val">125 cm</strong>
              </div>
              <div className="metric-cell">
                <span className="cell-label">适用地形</span>
                <strong className="cell-val">高海拔 / 碎石</strong>
              </div>
            </div>
            <div className="spec-verdict-line">
              <span className="verdict-dot" />
              <span>适合单人或极简二人快速穿越，极致缩减背负负荷。</span>
            </div>
          </div>
        </div>

        <div
          ref={(el) => {
            cardRefs.current["OD-1002"] = el;
          }}
          className={`lando-tent-card ${activeMode === "camp" ? "is-focused" : "is-subdued"}`}
          onMouseEnter={() => setActiveMode("camp")}
          onMouseMove={(e) => handleCardMouseMove(e, "OD-1002")}
          onMouseLeave={() => handleCardMouseLeave("OD-1002")}
        >
          <div className="lando-card-photo-wrap">
            <div className="lando-brush-mask" aria-hidden="true" />
            <div className="lando-card-badge green">
              <span className="badge-tag">ROUTE 02 · 营地定居</span>
              <strong className="badge-highlight">+35% 空间 · 160cm 加宽</strong>
            </div>
            <GearPrint product={campProd} tilt={1.5} index={1} />
          </div>

          <div className="paper lando-card-spec-sheet" data-reveal>
            <div className="spec-sheet-header">
              <h3>
                <Link href={`/equipment/${campProd.product_id}`}>{campProd.title}</Link>
              </h3>
              <span className="spec-price">
                ¥{campProd.price.toLocaleString("zh-CN")}
              </span>
            </div>
            <div className="spec-metrics-strip">
              <div className="metric-cell">
                <span className="cell-label">打包重量</span>
                <strong className="cell-val">3.20 kg</strong>
              </div>
              <div className="metric-cell">
                <span className="cell-label">展开宽度</span>
                <strong className="cell-val green">160 cm</strong>
              </div>
              <div className="metric-cell">
                <span className="cell-label">适用地形</span>
                <strong className="cell-val">林间湖畔自驾</strong>
              </div>
            </div>
            <div className="spec-verdict-line">
              <span className="verdict-dot green" />
              <span>适合自驾露营与周末小憩，坐卧从容，如同林间移动居室。</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lando-benchmark-footer" data-reveal>
        <Link
          className="field-button luxury-field-button"
          data-magnetic
          href={assistantLink(
            "请深入对比双人三季徒步帐篷 OD-1001 和双人宽居营地帐篷 OD-1002，从重量、防风指数与睡眠舒适度给出选购建议。",
          )}
        >
          <span>让助手为你剖析取舍</span> <Arrow />
        </Link>
      </div>
    </div>
  );
}
