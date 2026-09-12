"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { Arrow } from "./SiteChrome";
import { GearPrint } from "./LandingExperience";

interface TentBenchmarkStageProps {
  products: ProductDetails[];
}

const SPEC_LABELS = ["重量", "内帐尺寸", "适合", "价格"];

function getSpecValue(product: ProductDetails, label: string): string {
  if (label === "重量") return product.specs?.["重量"] ?? product.attributes?.highlight_1 ?? "";
  if (label === "内帐尺寸") return product.specs?.["内帐尺寸"] ?? "";
  if (label === "适合") return product.specs?.["适合场景"] ?? product.attributes?.activity ?? "";
  if (label === "价格") return `¥${product.price.toLocaleString("zh-CN")}`;
  return "";
}

export function TentBenchmarkStage({ products }: TentBenchmarkStageProps) {
  const [selectedTent, setSelectedTent] = useState<string>("OD-1001");
  const [animatedDiff, setAnimatedDiff] = useState(0);
  const [animatedSpace, setAnimatedSpace] = useState(0);
  const [inView, setInView] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const duration = 1200;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setAnimatedDiff(Math.round(1350 * ease));
      setAnimatedSpace(Math.round(35 * ease));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView]);

  return (
    <div ref={stageRef} className="benchmark-dual-container">
      {/* 1. Tactical Balance Beam HUD (物理天平称重系统) */}
      <div className="tactical-balance-beam" aria-label="帐篷重量物理天平对比">
        <div className="balance-header">
          <span className="balance-title">EXPEDITION WEIGHT BALANCE // 质量平衡解算</span>
          <span className="balance-delta-tag">Δ 物理质量落差</span>
        </div>

        <div className="beam-chassis">
          {/* Pivoting Scale Arm: OD-1002 (3.15kg) is heavier, so right pan sinks */}
          <div
            className={`beam-lever ${selectedTent === "OD-1001" ? "tilt-left" : "tilt-right"}`}
          >
            <div className="lever-rod" />

            {/* Left Pan: OD-1001 Ultralight */}
            <div
              className={`pan-weight pan-left ${selectedTent === "OD-1001" ? "is-selected" : ""}`}
              onClick={() => setSelectedTent("OD-1001")}
            >
              <span className="pan-tag">OD-1001 超轻款</span>
              <strong className="pan-mass">1,800 g</strong>
              <span className="pan-sub">轻量 42% · 单人轻行</span>
            </div>

            {/* Central Dial Fulcrum */}
            <div className="beam-fulcrum">
              <div className="fulcrum-pivot">
                <span className="pivot-needle" />
              </div>
              <div className="fulcrum-readout">
                <span className="readout-sign">-</span>
                <span className="readout-val">{animatedDiff}</span>
                <span className="readout-unit">g</span>
              </div>
            </div>

            {/* Right Pan: OD-1002 Spacious */}
            <div
              className={`pan-weight pan-right ${selectedTent === "OD-1002" ? "is-selected" : ""}`}
              onClick={() => setSelectedTent("OD-1002")}
            >
              <span className="pan-tag">OD-1002 宽居款</span>
              <strong className="pan-mass">3,150 g</strong>
              <span className="pan-sub">+160cm · 舒适双人</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Compare Section Grid */}
      <div className="compare-main-grid">
        <div className="compare-words">
          <h2 data-reveal>
            轻一点，
            <br />
            还是宽敞一点？
          </h2>
          <p data-reveal>
            价格之外，更有关键体验的取舍。把两顶旗舰帐篷摊开对比，重量与空间的差异一目了然。
          </p>

          <div className="compare-highlights-box" data-reveal>
            <div
              className={`diff-item ${selectedTent === "OD-1001" ? "is-active" : ""}`}
              onMouseEnter={() => setSelectedTent("OD-1001")}
            >
              <span className="diff-tag">重量减负</span>
              <span className="diff-val highlight-orange">
                -{animatedDiff} g (轻量 42%)
              </span>
            </div>
            <div
              className={`diff-item ${selectedTent === "OD-1002" ? "is-active" : ""}`}
              onMouseEnter={() => setSelectedTent("OD-1002")}
            >
              <span className="diff-tag">内帐空间</span>
              <span className="diff-val highlight-green">
                +{animatedSpace}% 舒适睡眠空间
              </span>
            </div>
            <div className="diff-item">
              <span className="diff-tag">预算差额</span>
              <span className="diff-val">¥200.00 投资取舍</span>
            </div>
          </div>

          <Link
            className="field-button luxury-field-button"
            data-magnetic
            data-reveal
            href={assistantLink(
              "请比较双人三季徒步帐篷 OD-1001 和双人宽居营地帐篷 OD-1002，解释重量、空间与价格的取舍。",
            )}
          >
            <span>让助手讲清楚</span> <Arrow />
          </Link>
        </div>

        {/* 3. The Two Tent Spec Cards with Interactive Laser Scanner */}
        <div className="compare-cloth luxury-compare-cloth">
          {products.map((product, index) => {
            const isUltralight = product.product_id === "OD-1001";
            const isSelected = selectedTent === product.product_id;

            return (
              <div
                className={`compare-item luxury-compare-item ${
                  isSelected ? "is-highlighted-tent" : ""
                }`}
                key={product.product_id}
                onMouseEnter={() => setSelectedTent(product.product_id)}
              >
                <div className="compare-print-wrap">
                  {/* Laser X-Ray scanner beam effect */}
                  <div className="tent-laser-scanner" aria-hidden="true" />
                  <GearPrint product={product} tilt={index ? 1.4 : -1.8} index={index} />
                  {isUltralight ? (
                    <span className="tent-badge badge-ultralight">超轻 1.8KG</span>
                  ) : (
                    <span className="tent-badge badge-comfort">加宽 160CM</span>
                  )}
                </div>

                <div className="paper spec-slip luxury-spec-slip" data-reveal>
                  <h3>
                    <Link href={`/equipment/${product.product_id}`}>{product.title}</Link>
                  </h3>

                  <dl>
                    {SPEC_LABELS.map((label) => {
                      const val = getSpecValue(product, label);
                      const isWeight = label === "重量";
                      const isSize = label === "内帐尺寸";
                      return (
                        <div
                          key={label}
                          className={isWeight || isSize ? "spec-row-highlight" : ""}
                        >
                          <dt>{label}</dt>
                          <dd>
                            <span>{val}</span>
                            {isWeight && isUltralight ? (
                              <em className="spec-tag-sub orange">超轻 1.8kg</em>
                            ) : null}
                            {isSize && !isUltralight ? (
                              <em className="spec-tag-sub green">加宽 160cm</em>
                            ) : null}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
