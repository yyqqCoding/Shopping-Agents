"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
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
    headline: ["走一程，", "喝一口。"],
    description: "把水带在身边，把脚步留给山野。随身的一壶，或是留给营地的储备，各有用处。",
    roles: ["随手喝一口", "把温热带上", "边走边补水", "留给营地", "坐下来慢饮"],
    ids: ["OD-7008", "OD-7009", "OD-7010", "OD-7011", "OD-7001"],
  },
  {
    key: "sleep",
    number: "02",
    title: "睡眠",
    headline: ["把好梦，", "装进行囊。"],
    description: "夜色交给山野，温暖留给自己。从舒适温度开始，找到今晚的睡眠搭档。",
    roles: ["春秋轻装", "低温扎营", "翻身自在", "夏夜轻行", "隔开地面"],
    ids: ["OD-2003", "OD-2004", "OD-2005", "OD-2006", "OD-2007"],
  },
  {
    key: "light",
    number: "03",
    title: "照明",
    headline: ["天黑了，", "也有方向。"],
    description: "头灯照顾脚下，营地灯照顾停留。让一束光，陪你把夜晚慢慢展开。",
    roles: ["营地走走", "随行备用", "为夜行准备", "远近光切换", "帐篷里的光"],
    ids: ["OD-6001", "OD-6002", "OD-6003", "OD-6004", "OD-6005"],
  },
  {
    key: "cook",
    number: "04",
    title: "炊具",
    headline: ["山野间，", "好好吃饭。"],
    description: "架起炉具，摆好碗筷。一个人的热汤，两个人的晚餐，都让这一程有了滋味。",
    roles: ["架起炉具", "两人的一餐", "轻装开饭", "围坐分享", "摆好碗筷"],
    ids: ["OD-7005", "OD-7003", "OD-7006", "OD-7004", "OD-7007"],
  },
] as const;

type ChapterKey = (typeof chapterDefinitions)[number]["key"];

const chapterPhotos: Partial<Record<ChapterKey, string>> = {
  water: "/images/landing/water-scene.webp",
  cook: "/images/landing/cook-scene.webp",
};

function specValue(product: ProductDetails, key: string) {
  const attributes = product.attributes ?? {};
  const value = attributes[key] ?? product.specs?.[key];
  if (!value) return key === "weight_g" ? "— g" : "—";
  return key === "weight_g" && /^\d+$/.test(value) ? `${value} g` : value;
}

function productFacts(product: ProductDetails, chapter: ChapterKey) {
  const weight = { label: "重量", value: specValue(product, "weight_g") };
  if (chapter === "water") {
    return [{ label: "容量", value: specValue(product, "capacity") }, weight];
  }
  if (chapter === "sleep") {
    return [
      product.attributes?.comfort_temperature
        ? { label: "舒适温度", value: specValue(product, "comfort_temperature") }
        : { label: "R 值", value: specValue(product, "r_value") },
      weight,
    ];
  }
  if (chapter === "light") {
    return [{ label: "最高亮度", value: specValue(product, "最高亮度") }, weight];
  }
  const key = product.attributes?.capacity
    ? "容量"
    : product.specs?.["标称功率"]
      ? "标称功率"
      : "组成";
  return [{ label: key, value: specValue(product, key) }, weight];
}

function ChapterScene({ chapter }: { chapter: ChapterKey }) {
  const photo = chapterPhotos[chapter];

  return (
    <div
      className={`field-scene field-scene-${chapter}${photo ? " field-scene-photo" : ""}`}
      data-chapter-scene
      aria-hidden="true"
    >
      {photo && (
        <div className="field-scene-camera">
          <Image
            className="field-scene-photo-image"
            src={photo}
            alt=""
            fill
            sizes="100vw"
            loading="eager"
            unoptimized
          />
          <svg
            className="field-photo-atmosphere"
            viewBox="0 0 1672 941"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
          >
            {chapter === "water" && (
              <>
                <defs>
                  <clipPath id="field-water-surface">
                    <ellipse cx="1157" cy="598" rx="109" ry="13" />
                  </clipPath>
                </defs>
                <g className="field-water-current">
                  <path className="field-water-flow" pathLength="100" d="M1214 347C1190 406 1176 497 1156 600" />
                  <path className="field-water-flow" pathLength="100" d="M1205 366C1184 430 1167 521 1152 599" />
                </g>
                <g clipPath="url(#field-water-surface)">
                  <ellipse className="field-water-ripple" cx="1157" cy="599" rx="105" ry="12" />
                  <ellipse className="field-water-ripple" cx="1157" cy="599" rx="105" ry="12" />
                  <ellipse className="field-water-ripple" cx="1157" cy="599" rx="105" ry="12" />
                </g>
              </>
            )}
            {chapter === "cook" && (
              <>
                <defs>
                  <linearGradient id="field-steam-fade" x1="0" y1="320" x2="0" y2="0" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fff8e8" stopOpacity="0" />
                    <stop offset="0.2" stopColor="#fff8e8" stopOpacity="0.6" />
                    <stop offset="0.65" stopColor="#fff8e8" stopOpacity="0.4" />
                    <stop offset="1" stopColor="#fff8e8" stopOpacity="0" />
                  </linearGradient>
                  <filter id="field-steam-soften" x="-60%" y="-30%" width="220%" height="160%" colorInterpolationFilters="sRGB">
                    <feGaussianBlur stdDeviation="4" />
                  </filter>
                </defs>
                <g className="field-cook-steam" stroke="url(#field-steam-fade)" filter="url(#field-steam-soften)">
                  <path d="M1147 313C1121 278 1194 249 1161 204S1118 151 1154 107 1182 53 1158 8" />
                  <path d="M1208 309C1232 266 1162 239 1190 194S1244 154 1212 104 1187 57 1219 10" />
                  <path d="M1176 310C1152 268 1209 224 1181 185S1148 135 1180 84" />
                </g>
              </>
            )}
          </svg>
        </div>
      )}
      {chapter === "sleep" && (
        <>
          <div className="field-sleep-horizon" />
          <svg className="field-sleep-sky" viewBox="0 0 1000 700" fill="none">
            <defs>
              <linearGradient id="field-meteor-trail">
                <stop stopColor="#f2f0e9" stopOpacity="0" />
                <stop offset="1" stopColor="#f2f0e9" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <path className="field-sleep-moon" d="M355 73a41 41 0 1 0 46 63 47 47 0 0 1-46-63Z" />
            <g className="field-sleep-stars">
              <circle cx="166" cy="176" r="2" /><circle cx="514" cy="108" r="2.5" />
              <circle cx="714" cy="58" r="1.5" /><circle cx="859" cy="205" r="2" />
              <circle cx="931" cy="82" r="1.5" /><circle cx="647" cy="183" r="1.5" />
              <path d="M553 42v12m-6-6h12M807 134v10m-5-5h10" />
            </g>
            <g className="field-sleep-meteor">
              <path d="m646 60 92 34" stroke="url(#field-meteor-trail)" strokeWidth="1.5" />
              <circle cx="738" cy="94" r="1.5" fill="#f2f0e9" />
            </g>
            <path className="field-sleep-orbit" d="M32 601C165 371 774 240 963 402M78 647C239 422 804 326 1007 462" />
          </svg>
        </>
      )}
      {chapter === "light" && (
        <>
          <div className="field-light-beam" />
          <svg className="field-light-arcs" viewBox="0 0 1000 700" fill="none">
            <path d="M474 626a255 255 0 0 0 0-510M548 688a333 333 0 0 0 0-666M627 762a422 422 0 0 0 0-844" />
            <path className="field-light-axis" d="m251 410 669-202" />
          </svg>
        </>
      )}
    </div>
  );
}

export function LandingPage({ products }: { products: ProductDetails[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, number>>({});
  const [motionPaused, setMotionPaused] = useState(false);
  useUnpackMotion(root, motionPaused);
  const revealVariant = (chapterKey: string, variantIndex: number) => {
    setSelectedVariants((current) =>
      current[chapterKey] === variantIndex
        ? current
        : { ...current, [chapterKey]: variantIndex },
    );
  };

  const product = (id: string) =>
    products.find((item) => item.product_id === id);

  return (
    <div className="field-home" data-motion-paused={motionPaused} ref={root}>
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
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <a href="#chapter-water" className="field-scroll">
                <span>往下，走进山野</span>
                <span className="field-scroll-arrow">
                  <Arrow />
                </span>
              </a>
            </section>
            <div className="field-chapters">
              {chapterDefinitions.map((chapter, chapterIndex) => {
                const variants = chapter.ids
                  .map((id) => product(id))
                  .filter((item): item is ProductDetails => Boolean(item));
                const activeIndex = selectedVariants[chapter.key] ?? 0;
                const active = variants[activeIndex] ?? variants[0];
                if (!active) return null;
                const hasPhoto = Boolean(chapterPhotos[chapter.key]);
                const nextChapter = chapterDefinitions[chapterIndex + 1];
                return (
                  <section
                    id={`chapter-${chapter.key}`}
                    className={`field-chapter field-chapter-${chapter.key}${hasPhoto ? " field-chapter-photo" : ""}`}
                    data-chapter
                    data-chapter-index={chapterIndex}
                    data-chapter-key={chapter.key}
                    aria-labelledby={`chapter-title-${chapter.key}`}
                    key={chapter.key}
                  >
                    <ChapterScene chapter={chapter.key} />
                    <div className="field-chapter-topline">
                      <a href="#main-content" className="field-chapter-home">
                        <OutdoorMark className="field-mark" />
                        <span>山野装备手记</span>
                      </a>
                      <nav className="field-chapter-nav" aria-label="装备章节">
                        {chapterDefinitions.map((item) => (
                          <a
                            key={item.key}
                            href={`#chapter-${item.key}`}
                            aria-current={item.key === chapter.key ? "step" : undefined}
                          >
                            <span>{item.number}</span>{item.title}
                          </a>
                        ))}
                      </nav>
                      <Link href="/equipment" className="field-chapter-catalog">
                        全部装备 <Arrow diagonal />
                      </Link>
                    </div>
                    <div className="field-chapter-body" data-chapter-body>
                      <div className="field-chapter-copy">
                        <h2 id={`chapter-title-${chapter.key}`}>
                          <span className="field-visually-hidden">{chapter.title}，</span>
                          {chapter.headline.map((line) => <span key={line}>{line}</span>)}
                        </h2>
                        <p>{chapter.description}</p>
                      </div>
                      <div className="field-chapter-info" data-chapter-info>
                        <div className="field-chapter-selection">
                          <span className="field-selection-letter" aria-hidden="true">
                            {String.fromCharCode(65 + activeIndex)}
                          </span>
                          <h3>{active.title}</h3>
                        </div>
                        <dl className="field-chapter-specs">
                          {productFacts(active, chapter.key).map((fact) => (
                            <div key={fact.label}>
                              <dt>{fact.label}</dt>
                              <dd className={fact.value.length > 12 ? "is-long" : undefined}>
                                {fact.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <div className="field-chapter-shopping">
                          <span className="field-chapter-price">
                            <small>¥</small>{active.price.toLocaleString("zh-CN")}
                          </span>
                          <Link
                            href={`/equipment/${active.product_id}`}
                            className="field-chapter-link"
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
                            onFocus={() =>
                              revealVariant(chapter.key, variantIndex)
                            }
                          >
                            <div className="field-product-object">
                              <div className="field-product-drift">
                                <Image
                                  src={`/images/landing/${variant.product_id}-alpha.png`}
                                  alt=""
                                  width={1024}
                                  height={1024}
                                  sizes={hasPhoto ? "8vw" : variantIndex === 0 ? "36vw" : "22vw"}
                                />
                              </div>
                            </div>
                            <div className="field-product-caption" aria-hidden="true">
                              <span className="field-product-letter">{String.fromCharCode(65 + variantIndex)}</span>
                              <span>
                                <b>{chapter.roles[chapter.ids.findIndex((id) => id === variant.product_id)]}</b>
                                <small>
                                  {chapter.key === "sleep" && variant.attributes?.comfort_temperature ? "舒适 " : ""}
                                  {chapter.key === "sleep" && variant.attributes?.r_value ? "R 值 " : ""}
                                  {chapter.key === "cook"
                                    ? specValue(variant, "weight_g")
                                    : productFacts(variant, chapter.key)[0].value}
                                </small>
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className="field-chapter-progress">
                      <i aria-hidden="true" />
                      <span className="field-chapter-position">{chapter.number}<span> / 04</span></span>
                      <div className="field-chapter-tools">
                        <button
                          type="button"
                          className="field-chapter-motion"
                          aria-pressed={motionPaused}
                          onClick={() => setMotionPaused((current) => !current)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            {motionPaused ? (
                              <path d="m8 5 10 7-10 7Z" fill="currentColor" />
                            ) : (
                              <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="2" />
                            )}
                          </svg>
                          <span>{motionPaused ? "播放动效" : "暂停动效"}</span>
                        </button>
                      </div>
                      <a href={nextChapter ? `#chapter-${nextChapter.key}` : "#field-finish"}>
                        {nextChapter ? `下一章 · ${nextChapter.title}` : "准备出发"}
                        <Arrow />
                      </a>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </main>
      <footer className="field-footer" id="field-finish">
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
