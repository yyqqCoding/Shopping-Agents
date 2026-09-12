"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { ProductImage } from "./ProductTile";
import { Arrow } from "./SiteChrome";
import { TelemetryCanvas } from "./TelemetryCanvas";

/*
 * Expedition Telemetry & Tactical Schematics System.
 *
 * The departure table evolved into an interactive mission console:
 * - Telemetry radar & dynamic contour vector field
 * - Laser assembly scanner for incoming gear prints
 * - 3D Spring-physics tilt & tactile snap-locks
 * - Liquid-glass refractive surfaces and telemetry HUD readout
 */

export const HERO_SCENES = {
  camping: {
    sector: "SECTOR 01",
    label: "林间露营",
    coords: "30°18'N · 119°26'E",
    elev: "+840M",
    image: "/images/camping.webp",
  },
  hiking: {
    sector: "SECTOR 02",
    label: "轻装徒步",
    coords: "31°14'N · 118°22'E",
    elev: "+1,420M",
    image: "/images/hiking.webp",
  },
  sunrise: {
    sector: "SECTOR 03",
    label: "山间日出",
    coords: "29°42'N · 120°10'E",
    elev: "+1,860M",
    image: "/images/hero.webp",
  },
};

export type HeroKit = {
  scene: keyof typeof HERO_SCENES;
  prompt: string;
  budget: number | null;
  items: { product: ProductDetails; qty: number }[];
  pending: { product: ProductDetails; note: string };
};

const TYPE_MS = 50;
const ERASE_MS = 14;
const HOLD_MS = 4600;
const REST_MS = 380;

function yuan(n: number) {
  return `¥${n.toLocaleString("zh-CN")}`;
}

/** Animated rolling odometer counter for prices and totals */
function AnimatedCounter({ value, prefix = "¥" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    prevRef.current = end;
    if (start === end) return;

    const duration = 480;
    const startTime = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / duration);
      // spring-like ease-out cubic
      const ease = 1 - Math.pow(1 - p, 3);
      const current = Math.round(start + (end - start) * ease);
      setDisplay(current);
      if (p < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="odometer-num">
      {prefix}
      {display.toLocaleString("zh-CN")}
    </span>
  );
}

export function HeroTable({
  kits,
  children,
}: {
  kits: HeroKit[];
  children: React.ReactNode;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [kit, setKit] = useState(0);
  const [chars, setChars] = useState(0);
  const [stage, setStage] = useState({ kit: 0, landed: 0 });
  const [settled, setSettled] = useState(false);
  const [playback, setPlayback] = useState({ start: 0, playing: true });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [active, setActive] = useState(true);

  // 3D Tilt Spring Physics State for Equipment Cards (Branch A)
  const [activeHoverCard, setActiveHoverCard] = useState<number | null>(null);
  const [cardTilt, setCardTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const current = kits[kit];
  const sceneData = HERO_SCENES[current.scene];
  const example = current.prompt.slice(0, chars);
  const count = current.items.length;
  const landed = stage.kit === kit ? stage.landed : 0;
  const playing = playback.playing && !reducedMotion;
  const playbackLabel = playing ? "暂停战术巡航" : "启动战术巡航";
  const playbackHint = reducedMotion
    ? "已跟随系统减少动态效果"
    : focused || draft.length > 0
      ? "输入任务指令时自动定格"
      : playbackLabel;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let index = playback.start;
    let c = 0;
    let deleting = false;
    let timer = 0;
    let inView = true;

    const finish = (idx: number) => {
      setKit(idx);
      setChars(kits[idx].prompt.length);
      setStage({ kit: idx, landed: kits[idx].items.length });
      setSettled(true);
    };

    const tick = () => {
      if (!inView || document.hidden || motion.matches || !playback.playing) return;
      const full = kits[index].prompt;
      const n = kits[index].items.length;
      let delay = deleting ? ERASE_MS : TYPE_MS;
      c += deleting ? -1 : 1;
      setChars(c);

      if (!deleting) {
        const per = full.length / (n + 0.35);
        const now = Math.min(n, Math.floor(c / per));
        if (now > 0) {
          setStage((previous) =>
            previous.kit === index && previous.landed >= now
              ? previous
              : { kit: index, landed: now },
          );
        }
        if (c === full.length) {
          setStage({ kit: index, landed: n });
          setSettled(true);
          deleting = true;
          delay = HOLD_MS;
        }
      } else if (c === full.length - 1) {
        setSettled(false);
      } else if (c === 0) {
        deleting = false;
        index = (index + 1) % kits.length;
        setKit(index);
        delay = REST_MS;
      }
      timer = window.setTimeout(tick, delay);
    };

    const syncVisibility = () => {
      window.clearTimeout(timer);
      const visible = inView && !document.hidden;
      setActive(visible);
      if (visible && playback.playing && !motion.matches) {
        timer = window.setTimeout(tick, TYPE_MS);
      }
    };

    const syncMotion = () => {
      window.clearTimeout(timer);
      setReducedMotion(motion.matches);
      if (motion.matches || !playback.playing) {
        finish(index);
        return;
      }
      c = 0;
      deleting = false;
      setKit(index);
      setChars(0);
      setSettled(false);
      if (inView && !document.hidden) timer = window.setTimeout(tick, REST_MS);
    };

    syncMotion();
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        syncVisibility();
      },
      { threshold: 0.05 },
    );
    if (sceneRef.current) observer.observe(sceneRef.current);
    document.addEventListener("visibilitychange", syncVisibility);
    motion.addEventListener("change", syncMotion);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      motion.removeEventListener("change", syncMotion);
    };
  }, [kits, playback]);

  // Spatial Pointer Depth tracking for environmental tilt
  useEffect(() => {
    const scene = sceneRef.current;
    if (
      !scene ||
      !active ||
      reducedMotion ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    )
      return;

    let frame = 0;
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;
    let bounds: DOMRect | null = null;

    const draw = () => {
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      scene.style.setProperty("--pointer-x", x.toFixed(4));
      scene.style.setProperty("--pointer-y", y.toFixed(4));
      frame =
        Math.abs(targetX - x) + Math.abs(targetY - y) > 0.002
          ? window.requestAnimationFrame(draw)
          : 0;
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };

    const invalidateBounds = () => {
      bounds = null;
    };

    const move = (event: PointerEvent) => {
      bounds ??= scene.getBoundingClientRect();
      targetX = Math.max(
        -1,
        Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1),
      );
      targetY = Math.max(
        -1,
        Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1),
      );
      schedule();
    };

    const reset = () => {
      targetX = 0;
      targetY = 0;
      schedule();
    };

    scene.addEventListener("pointerenter", invalidateBounds);
    scene.addEventListener("pointermove", move, { passive: true });
    scene.addEventListener("pointerleave", reset);
    window.addEventListener("resize", invalidateBounds);
    window.addEventListener("scroll", invalidateBounds, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      scene.removeEventListener("pointerenter", invalidateBounds);
      scene.removeEventListener("pointermove", move);
      scene.removeEventListener("pointerleave", reset);
      window.removeEventListener("resize", invalidateBounds);
      window.removeEventListener("scroll", invalidateBounds);
      scene.style.removeProperty("--pointer-x");
      scene.style.removeProperty("--pointer-y");
    };
  }, [active, reducedMotion]);

  // Card Mouse Move Handler for 3D Spring Physics Tilt (Branch A)
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>, idx: number) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2; // -1 to 1
    setActiveHoverCard(idx);
    setCardTilt({ x: nx * 14, y: -ny * 14 });
  };

  const handleCardMouseLeave = () => {
    setActiveHoverCard(null);
    setCardTilt({ x: 0, y: 0 });
  };

  const engage = () => {
    setPlayback({ start: kit, playing: false });
    setFocused(true);
  };

  const chosen = current.items.slice(0, landed);
  const total = chosen.reduce(
    (sum, { product, qty }) => sum + product.price * qty,
    0,
  );

  return (
    <div
      ref={sceneRef}
      className="hero-experience telemetry-experience"
      data-playing={playing}
      data-active={active}
    >
      {/* 1. Tactical Environmental Canvas & Backgrounds */}
      <div className="table-environment" aria-hidden="true">
        {kits.map(({ scene }, index) => (
          <div
            className="table-landscape"
            data-scene={scene}
            data-active={index === kit}
            key={scene}
          >
            <Image
              src={HERO_SCENES[scene].image}
              alt=""
              fill
              sizes="100vw"
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "low"}
            />
          </div>
        ))}
        {/* Real-time Topographic Contour & Radar Particle Canvas */}
        <TelemetryCanvas activeScene={current.scene} />
      </div>

      <div className="table" data-playing={playing}>
        {/* Left: Interactive Departure Table & Scene Selector */}
        <div className="table-words">
          {children}

          {/* Frosted Liquid Glass Departure Slip */}
          <div className="departure-slip-wrap" data-hero="slip">
            <form
              action="/chat"
              className="slip luxury-slip"
              onSubmit={(event) => {
                if (draft.trim()) return;
                event.preventDefault();
                window.location.href = assistantLink(current.prompt);
              }}
            >
              <label htmlFor="hero-draft" className="sr-only">
                描述你的下一程出行需求
              </label>

              <div className="slip-field">
                <textarea
                  id="hero-draft"
                  name="draft"
                  rows={2}
                  maxLength={1200}
                  value={draft}
                  placeholder=""
                  onChange={(event) => setDraft(event.target.value)}
                  onFocus={engage}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                {/* Real-time typing stream simulation */}
                <span
                  className="slip-example"
                  aria-hidden="true"
                  data-hidden={focused || draft.length > 0}
                >
                  {example}
                </span>
              </div>

              <button
                type="submit"
                className="luxury-submit-btn"
                aria-label="带着这段行程进入智能助手"
              >
                <Arrow />
                <span className="btn-glow" aria-hidden="true" />
              </button>
            </form>
          </div>

          {/* Clean Scene Selector & Playback Controls */}
          <div className="table-scenes" data-hero="scenes">
            <div
              className="table-scene-options editorial-scenes"
              role="group"
              aria-label="切换场景与示例行程"
            >
              {kits.map(({ scene }, index) => {
                const s = HERO_SCENES[scene];
                const isSelected = index === kit;
                return (
                  <button
                    key={scene}
                    type="button"
                    className="scene-pill-btn"
                    aria-pressed={isSelected}
                    onClick={() => setPlayback({ start: index, playing: false })}
                  >
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              className="table-playback editorial-playback-btn"
              type="button"
              disabled={reducedMotion || focused || draft.length > 0}
              aria-label={playbackLabel}
              title={playbackHint}
              onClick={() => setPlayback({ start: kit, playing: !playback.playing })}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                {playing ? (
                  <path
                    d="M7 5v10M13 5v10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ) : (
                  <path d="m7 4 9 6-9 6V4Z" fill="currentColor" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Right: Studio-grade Floating Gear Prints & Packing Manifest */}
        <div className="table-cloth luxury-stage" data-hero="cloth">
          {/* 3D Spring-physics Floating Gear Prints */}
          <div className="table-prints" aria-hidden="true">
            {kits.map((entry, k) =>
              entry.items.map(({ product, qty }, index) => {
                const isCurrentKit = stage.kit === k;
                const isLanded = isCurrentKit && index < stage.landed;
                const isHovered = activeHoverCard === index;

                // 3D Spring tilt transform style
                const dynamicTiltStyle = isHovered
                  ? {
                      transform: `translateZ(75px) rotateY(${cardTilt.x}deg) rotateX(${cardTilt.y}deg) scale(1.04)`,
                      transition: "transform 80ms ease-out",
                    }
                  : undefined;

                return (
                  <div
                    className={`print table-print table-print-${index} luxury-gear-print`}
                    key={`${k}-${product.product_id}`}
                    data-landed={isLanded}
                    onMouseMove={(e) => handleCardMouseMove(e, index)}
                    onMouseLeave={handleCardMouseLeave}
                    style={dynamicTiltStyle}
                  >
                    <ProductImage
                      product={product}
                      sizes="(max-width: 820px) 44vw, 420px"
                    />

                    {/* Subtle liquid glass light reflection */}
                    <div className="card-liquid-sheen" aria-hidden="true" />
                  </div>
                );
              }),
            )}
          </div>

          {/* Editorial Packing List (Departure Manifest) with Odometer */}
          <div className="paper packing-list luxury-manifest" data-settled={settled}>
            <header>
              <div className="manifest-title-row">
                <span className="manifest-label">出发装备清单</span>
              </div>
              <div className="manifest-count-row">
                <span className="manifest-count">
                  {settled ? `${count} 件已就绪` : `${landed} / ${count} 装备搭配`}
                </span>
                {/* Segmented Progress Dots */}
                <div className="slots-meter" aria-hidden="true">
                  {Array.from({ length: count }).map((_, i) => (
                    <span
                      key={i}
                      className={`slot-dot ${i < landed ? "is-loaded" : ""}`}
                    />
                  ))}
                </div>
              </div>
            </header>

            {/* Gear Items List */}
            <ol>
              {current.items.map(({ product, qty }, index) => {
                const isChecked = index < landed;
                return (
                  <li
                    key={product.product_id}
                    data-checked={isChecked}
                    className="manifest-item"
                  >
                    <span className="tick luxury-tick" aria-hidden="true">
                      <svg viewBox="0 0 20 20" width="18" height="18">
                        <path
                          d="M4 10.5 8.2 14.5 16 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="packing-name manifest-item-name">
                      <strong>{product.title}</strong>
                      {qty > 1 ? <em> ×{qty}</em> : null}
                    </span>
                    <span className="packing-price manifest-item-price">
                      {yuan(product.price * qty)}
                    </span>
                  </li>
                );
              })}

              {/* Pending Gear Recommendation */}
              <li className="packing-pending manifest-pending" data-shown={settled}>
                <span className="tick luxury-tick" aria-hidden="true" />
                <span className="packing-name manifest-item-name">
                  <strong>建议追加 {current.pending.product.title}</strong>
                  <em>{current.pending.note}</em>
                </span>
                <span className="packing-price manifest-item-price">
                  {yuan(current.pending.product.price)}
                </span>
              </li>
            </ol>

            {/* Manifest Footer with Animated Rolling Counter */}
            <footer>
              <div className="footer-label-col">
                <span>预估总计</span>
              </div>
              <div className="footer-total-col">
                <strong>
                  {landed > 0 ? (
                    <AnimatedCounter value={total} />
                  ) : (
                    <span>—</span>
                  )}
                  {current.budget ? (
                    <span className="budget-target">
                      {" "}
                      / 预算 {yuan(current.budget)}
                    </span>
                  ) : null}
                </strong>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A photograph print laid on the cloth, linking to the equipment it shows. */
export function GearPrint({
  product,
  tilt = 0,
  index = 0,
  priority = false,
}: {
  product: ProductDetails;
  tilt?: number;
  index?: number;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/equipment/${product.product_id}`}
      className="print gear-print luxury-gear-print"
      data-land
      style={{ "--tilt": `${tilt}deg`, "--i": index } as React.CSSProperties}
      aria-label={`查看${product.title}`}
    >
      <ProductImage
        product={product}
        priority={priority}
        sizes="(max-width: 820px) 46vw, 380px"
      />
    </Link>
  );
}

/**
 * Reveal-on-scroll and the header state flip with magnetic interactions.
 */
export function LandingMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header-overlay");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal], [data-land]"),
    );
    const viewportHeight = window.innerHeight;
    const pending = targets.filter((element) => {
      const rect = element.getBoundingClientRect();
      const onScreen = rect.top < viewportHeight && rect.bottom > 0;
      if (onScreen) element.classList.add("is-visible");
      return !onScreen;
    });
    document.documentElement.classList.add("motion-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    pending.forEach((element) => observer.observe(element));

    const syncHeader = () => {
      header?.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });

    const onPreference = () => {
      if (reduced.matches) {
        targets.forEach((element) => element.classList.add("is-visible"));
      }
    };
    onPreference();
    reduced.addEventListener("change", onPreference);

    const magnetic = Array.from(
      document.querySelectorAll<HTMLElement>("[data-magnetic]"),
    );
    const cleanupMagnetic = magnetic.map((element) => {
      let frame = 0;
      let bounds: DOMRect | null = null;
      const enter = () => {
        bounds = element.getBoundingClientRect();
      };
      const reset = () => {
        window.cancelAnimationFrame(frame);
        element.style.removeProperty("--magnetic-x");
        element.style.removeProperty("--magnetic-y");
        bounds = null;
      };
      const move = (event: PointerEvent) => {
        if (reduced.matches || event.pointerType !== "mouse") return;
        bounds ??= element.getBoundingClientRect();
        const x = Math.max(
          -6,
          Math.min(6, ((event.clientX - bounds.left) / bounds.width - 0.5) * 12),
        );
        const y = Math.max(
          -5,
          Math.min(5, ((event.clientY - bounds.top) / bounds.height - 0.5) * 10),
        );
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          element.style.setProperty("--magnetic-x", `${x.toFixed(2)}px`);
          element.style.setProperty("--magnetic-y", `${y.toFixed(2)}px`);
        });
      };
      element.addEventListener("pointerenter", enter);
      element.addEventListener("pointermove", move, { passive: true });
      element.addEventListener("pointerleave", reset);
      reduced.addEventListener("change", reset);
      return () => {
        reset();
        element.removeEventListener("pointerenter", enter);
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerleave", reset);
        reduced.removeEventListener("change", reset);
      };
    });

    return () => {
      cleanupMagnetic.forEach((cleanup) => cleanup());
      reduced.removeEventListener("change", onPreference);
      window.removeEventListener("scroll", syncHeader);
      observer.disconnect();
    };
  }, []);

  return null;
}
