"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { Arrow } from "../SiteChrome";
import OutdoorMark from "../OutdoorMark";
import { useUnpackMotion } from "./motion/useUnpackMotion";

const bottlePrompt =
  "准备一天的近郊徒步，已有徒步鞋，预算 700 元。帮我挑背包、水壶和备用头灯。";

const chapterDefinitions = [
  {
    key: "water",
    number: "01",
    title: "饮水",
    ids: ["OD-7008", "OD-7009", "OD-7010", "OD-7011", "OD-7001"],
    specs: ["capacity", "weight_g"],
  },
  {
    key: "sleep",
    number: "02",
    title: "睡眠",
    ids: ["OD-2003", "OD-2004", "OD-2005", "OD-2006", "OD-2007"],
    specs: ["comfort_temperature", "weight_g"],
  },
  {
    key: "light",
    number: "03",
    title: "照明",
    ids: ["OD-6001", "OD-6002", "OD-6003", "OD-6004", "OD-6005"],
    specs: ["highlight_1", "highlight_2"],
  },
  {
    key: "cook",
    number: "04",
    title: "炊具",
    ids: ["OD-7005", "OD-7003", "OD-7006", "OD-7004", "OD-7007"],
    specs: ["weight_g", "highlight_2"],
  },
] as const;

function specValue(product: ProductDetails, key: string) {
  const attributes = product.attributes ?? {};
  const value = attributes[key] ?? product.specs?.[key];
  if (!value) return key === "weight_g" ? "— g" : "—";
  return key === "weight_g" && /^\d+$/.test(value) ? `${value} g` : value;
}

export function LandingPage({ products }: { products: ProductDetails[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [hoveredVariants, setHoveredVariants] = useState<
    Record<string, number | null>
  >({});
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useUnpackMotion(root, false);

  useEffect(
    () => () => {
      if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
    },
    [],
  );

  const revealVariant = (chapterKey: string, variantIndex: number) => {
    if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
    setHoveredVariants((current) => ({
      ...current,
      [chapterKey]: variantIndex,
    }));
  };
  const hideVariant = (chapterKey: string) => {
    if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
    hoverLeaveTimer.current = setTimeout(() => {
      setHoveredVariants((current) => ({
        ...current,
        [chapterKey]: null,
      }));
    }, 420);
  };

  const product = (id: string) =>
    products.find((item) => item.product_id === id);

  return (
    <div className="field-home" ref={root}>
      <svg
        width="0"
        height="0"
        className="field-compositing-defs"
        aria-hidden="true"
      >
        <defs>
          <clipPath id="field-front-rim" clipPathUnits="objectBoundingBox">
            <path d="M0 .33 L.325 .25 C.37 .275 .43 .29 .51 .295 C.60 .31 .70 .287 .76 .255 L1 .33 L1 1 L0 1Z" />
          </clipPath>
        </defs>
      </svg>
      <header className="field-nav">
        <a href="#main-content" className="field-skip">
          跳到正文
        </a>
        <Link href="/" className="field-brand" aria-label="户外装备助手首页">
          <OutdoorMark className="field-mark" />
          <span>
            户外装备
            <br />
            助手
          </span>
        </Link>
        <nav aria-label="首页导航">
          <a className="field-nav-scene" href="#chapter-water">
            装备章节
          </a>
          <Link className="field-nav-catalog" href="/equipment">
            装备目录
          </Link>
          <Link href="/chat" className="field-button">
            <span>开始准备</span>
            <Arrow diagonal />
          </Link>
        </nav>
      </header>
      <main id="main-content">
        <div className="field-unpack">
          <div className="field-unpack-stage">
            <section className="field-hero" aria-labelledby="field-title">
              <div className="field-contours" aria-hidden="true">
                <svg
                  viewBox="0 0 1600 1000"
                  fill="none"
                  preserveAspectRatio="xMidYMid slice"
                >
                  <path d="M-130 110C100-220 780 70 620 300S20 380 100 720s720 300 820 60 680-130 840 30" />
                  <path d="M-80 190C150-90 680 100 550 290S-30 420 160 710s620 250 730 20 630-110 820 40" />
                  <path d="M-50 270C200 10 590 130 480 290S40 450 220 690s520 180 630-10 570-100 810 40" />
                  <path d="M840-130c-180 290 460 160 370 450s-260 300-170 670" />
                  <path d="M960-140c-180 290 480 200 320 500s-210 300-120 670" />
                </svg>
              </div>
              <h1 id="field-title" className="field-hero-title">
                <span>向山野</span>
                <span>
                  再出发<span className="field-period">。</span>
                </span>
              </h1>
              <div className="field-hero-object" data-hero-object>
                <div className="field-hero-arrival">
                  <div className="field-hero-tilt">
                    <div className="field-hero-float">
                      <div className="field-bag-shell">
                        <Image
                          className="field-bag-closed"
                          src="/images/landing/backpack-closed-alpha.png"
                          alt="深灰绿色徒步背包，带着装备向山野出发"
                          width={1254}
                          height={1254}
                          priority
                          sizes="54vw"
                        />
                        <Image
                          className="field-bag-open"
                          src="/images/landing/backpack-open-alpha.png"
                          alt=""
                          width={1254}
                          height={1254}
                          priority
                          sizes="54vw"
                          aria-hidden="true"
                        />
                        <div className="field-bag-front-wrap">
                          <Image
                            className="field-bag-front"
                            src="/images/landing/backpack-open-alpha.png"
                            alt=""
                            width={1254}
                            height={1254}
                            priority
                            sizes="54vw"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <a href="#chapter-water" className="field-scroll">
                <span>往下，打开装备包</span>
                <span className="field-scroll-arrow">
                  <Arrow />
                </span>
              </a>
            </section>
            <div className="field-chapters">
              <div className="field-chapter-rail" aria-hidden="true">
                {chapterDefinitions.map((chapter) => (
                  <span key={chapter.key}>{chapter.number}</span>
                ))}
              </div>
              {chapterDefinitions.map((chapter, chapterIndex) => {
                const variants = chapter.ids
                  .map((id) => product(id))
                  .filter((item): item is ProductDetails => Boolean(item));
                const hoveredIndex = hoveredVariants[chapter.key] ?? null;
                const activeIndex = hoveredIndex ?? 0;
                const active = variants[activeIndex] ?? variants[0];
                if (!active) return null;
                return (
                  <section
                    id={`chapter-${chapter.key}`}
                    className={`field-chapter field-chapter-${chapterIndex} ${
                      hoveredIndex !== null ? "is-hovered" : ""
                    }`}
                    data-chapter
                    data-chapter-index={chapterIndex}
                    aria-labelledby={`chapter-title-${chapter.key}`}
                    key={chapter.key}
                  >
                    <div className="field-chapter-copy">
                      <span className="field-chapter-number">
                        {chapter.number}
                      </span>
                      <h2 id={`chapter-title-${chapter.key}`}>
                        {chapter.title}
                      </h2>
                      <div
                        className="field-chapter-info field-chapter-hover-copy"
                        data-chapter-info
                        aria-hidden={hoveredIndex === null}
                        onMouseEnter={() =>
                          revealVariant(chapter.key, activeIndex)
                        }
                        onMouseLeave={() => hideVariant(chapter.key)}
                      >
                        <h3 key={`${chapter.key}-${active.product_id}`}>
                          {active.title}
                        </h3>
                        <div className="field-chapter-specs">
                          {chapter.specs.map((key) => (
                            <span key={key}>
                              <small>
                                {key === "weight_g"
                                  ? "重量"
                                  : key === "capacity"
                                    ? "容量"
                                    : key === "comfort_temperature"
                                      ? "舒适温度"
                                      : key === "highlight_2"
                                        ? "性能"
                                        : "参数"}
                              </small>
                              <b>{specValue(active, key)}</b>
                            </span>
                          ))}
                        </div>
                        <Link
                          href={`/equipment/${active.product_id}`}
                          className="field-chapter-link"
                          tabIndex={hoveredIndex === null ? -1 : 0}
                          onMouseEnter={() =>
                            revealVariant(chapter.key, activeIndex)
                          }
                          onMouseLeave={() => hideVariant(chapter.key)}
                          onFocus={() =>
                            revealVariant(chapter.key, activeIndex)
                          }
                          onBlur={() => hideVariant(chapter.key)}
                        >
                          查看装备 <Arrow diagonal />
                        </Link>
                      </div>
                    </div>
                    <div className="field-chapter-products">
                      {variants.map((variant, variantIndex) => (
                        <Link
                          key={variant.product_id}
                          href={`/equipment/${variant.product_id}`}
                          className={`field-chapter-variant field-chapter-variant-${variantIndex} ${
                            variantIndex === activeIndex ? "is-active" : ""
                          }`}
                          data-chapter-variant
                          data-variant-index={variantIndex}
                          aria-label={variant.title}
                          onMouseEnter={() =>
                            revealVariant(chapter.key, variantIndex)
                          }
                          onMouseLeave={() => hideVariant(chapter.key)}
                          onFocus={() =>
                            revealVariant(chapter.key, variantIndex)
                          }
                          onBlur={() => hideVariant(chapter.key)}
                        >
                          <Image
                            src={`/images/landing/${variant.product_id}-alpha.png`}
                            alt=""
                            width={1024}
                            height={1024}
                            sizes="42vw"
                          />
                          <span>{String.fromCharCode(65 + variantIndex)}</span>
                        </Link>
                      ))}
                    </div>
                    <div className="field-chapter-progress" aria-hidden="true">
                      <span>{chapter.number}</span>
                      <i />
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </main>
      <footer className="field-footer">
        <p>下一程，从这里开始。</p>
        <Link href={assistantLink(bottlePrompt)} className="field-footer-cta">
          <span>准备，出发。</span>
          <span className="field-footer-arrow">
            <Arrow diagonal />
          </span>
        </Link>
        <div className="field-footer-bottom">
          <Link href="/" className="field-brand">
            <OutdoorMark className="field-mark" />
            <span>户外装备助手</span>
          </Link>
          <nav aria-label="页脚导航">
            <Link href="/equipment">装备目录</Link>
            <a href="#main-content">
              回到顶部 <Arrow />
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
