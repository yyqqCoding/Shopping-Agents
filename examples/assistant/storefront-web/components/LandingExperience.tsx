"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { ProductImage } from "./ProductTile";
import { Arrow } from "./SiteChrome";

/*
 * The dawn scene is drawn, not filmed: layered ridge silhouettes breathe on slow
 * sine drift, mist bands wander between them, and warm motes rise through the
 * light. One canvas, one rAF loop, paused offscreen; reduced motion gets a
 * single still frame.
 */

type RidgeLayer = {
  base: number; // vertical anchor, fraction of scene height
  amp: number; // silhouette amplitude, fraction of scene height
  fill: string;
  drift: number; // sideways wander, px/s at 1x depth
  depth: number; // pointer parallax weight
  morph: number; // temporal breathing speed
  octaves: [number, number, number][]; // [freq, phase, weight]
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const SCENE_LAYERS: RidgeLayer[] = (() => {
  const rand = seededRandom(20260909);
  const make = (
    base: number,
    amp: number,
    fill: string,
    drift: number,
    depth: number,
    morph: number,
  ): RidgeLayer => ({
    base,
    amp,
    fill,
    drift,
    depth,
    morph,
    octaves: [0, 1, 2].map(() => [
      0.0016 + rand() * 0.0034,
      rand() * Math.PI * 2,
      0.35 + rand() * 0.65,
    ]),
  });
  return [
    make(0.42, 0.11, "#c3d4cb", 2.4, 4, 0.016),
    make(0.52, 0.14, "#9db8aa", 3.6, 9, 0.02),
    make(0.63, 0.16, "#6f9483", 5.2, 16, 0.024),
    make(0.75, 0.18, "#41695a", 7.4, 26, 0.03),
    make(0.9, 0.2, "#1c3d31", 10, 40, 0.036),
  ];
})();

const MOTE_COUNT = 42;

export function DawnCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let active = false;
    let time = 14; // open on a composed frame, not the origin
    let last = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    let sky: CanvasGradient | null = null;
    let mistSprite: HTMLCanvasElement | null = null;
    let moteSprite: HTMLCanvasElement | null = null;

    const rand = seededRandom(418);
    const motes = Array.from({ length: MOTE_COUNT }, () => ({
      x: rand(),
      y: rand(),
      size: 1.5 + rand() * 3.4,
      rise: 5 + rand() * 9,
      sway: 8 + rand() * 22,
      phase: rand() * Math.PI * 2,
      depth: 0.3 + rand() * 0.7,
    }));

    function buildSprites() {
      mistSprite = document.createElement("canvas");
      mistSprite.width = 256;
      mistSprite.height = 64;
      const mistCtx = mistSprite.getContext("2d");
      if (mistCtx) {
        const gradient = mistCtx.createRadialGradient(128, 32, 4, 128, 32, 128);
        gradient.addColorStop(0, "rgba(255, 253, 246, 0.85)");
        gradient.addColorStop(0.55, "rgba(255, 253, 246, 0.32)");
        gradient.addColorStop(1, "rgba(255, 253, 246, 0)");
        mistCtx.fillStyle = gradient;
        mistCtx.fillRect(0, 0, 256, 64);
      }
      moteSprite = document.createElement("canvas");
      moteSprite.width = 32;
      moteSprite.height = 32;
      const moteCtx = moteSprite.getContext("2d");
      if (moteCtx) {
        const gradient = moteCtx.createRadialGradient(16, 16, 0.5, 16, 16, 16);
        gradient.addColorStop(0, "rgba(255, 238, 196, 0.95)");
        gradient.addColorStop(0.4, "rgba(255, 226, 164, 0.45)");
        gradient.addColorStop(1, "rgba(255, 226, 164, 0)");
        moteCtx.fillStyle = gradient;
        moteCtx.fillRect(0, 0, 32, 32);
      }
    }

    function ridgeY(layer: RidgeLayer, x: number, t: number) {
      const drifted = x + t * layer.drift;
      let offset = 0;
      layer.octaves.forEach(([freq, phase, weight], index) => {
        const breathe =
          index === 1 ? Math.sin(t * layer.morph + phase) * 0.35 : 0;
        offset += Math.sin(drifted * freq + phase + breathe) * weight;
      });
      return height * layer.base - offset * height * layer.amp * 0.5;
    }

    function draw(t: number) {
      if (!ctx || !sky) return;
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      // Morning sun: a warm presence high right, breathing very slowly.
      const sunX = width * 0.7 + pointer.x * -18;
      const sunY = height * 0.24 + pointer.y * -10;
      const sunRadius = Math.max(width, height) * (0.52 + Math.sin(t * 0.05) * 0.02);
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
      glow.addColorStop(0, "rgba(255, 236, 190, 0.9)");
      glow.addColorStop(0.28, "rgba(255, 226, 168, 0.38)");
      glow.addColorStop(1, "rgba(255, 226, 168, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // One soft light shaft leaning out of the sun.
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(0.42);
      const shaft = ctx.createLinearGradient(0, 0, 0, height * 1.2);
      shaft.addColorStop(0, "rgba(255, 240, 205, 0.20)");
      shaft.addColorStop(1, "rgba(255, 240, 205, 0)");
      ctx.fillStyle = shaft;
      ctx.fillRect(-width * 0.06, 0, width * 0.12, height * 1.4);
      ctx.restore();

      SCENE_LAYERS.forEach((layer, index) => {
        const shiftX = pointer.x * layer.depth;
        const shiftY = pointer.y * layer.depth * 0.4;
        ctx.beginPath();
        ctx.moveTo(-60, height + 60);
        for (let x = -60; x <= width + 60; x += 7) {
          ctx.lineTo(x, ridgeY(layer, x, t) + shiftY);
        }
        ctx.lineTo(width + 60, height + 60);
        ctx.closePath();
        ctx.save();
        ctx.translate(shiftX * 0.4, 0);
        ctx.fillStyle = layer.fill;
        ctx.fill();
        ctx.restore();

        // Mist drifts in the valley in front of every ridge but the nearest.
        // The wrap span runs fully off-screen on both sides so the loop never pops.
        if (mistSprite && index < SCENE_LAYERS.length - 1) {
          const bandY = height * layer.base + Math.sin(t * 0.07 + index) * 6;
          const span = width * 2.2 + 600;
          const bandX =
            ((t * (9 + index * 5) + index * 320) % span) - width * 0.6 - 300;
          const alpha = 0.34 + Math.sin(t * 0.11 + index * 2.1) * 0.12;
          ctx.globalAlpha = Math.max(alpha, 0.12);
          ctx.drawImage(
            mistSprite,
            bandX - width * 0.5,
            bandY - height * 0.075,
            width * 1.1,
            height * 0.15,
          );
          ctx.globalAlpha = 1;
        }
      });

      // Light motes rising through the air.
      if (moteSprite) {
        for (const mote of motes) {
          const y =
            (((mote.y * height - t * mote.rise) % (height + 80)) +
              height +
              80) %
            (height + 80);
          const x =
            mote.x * width +
            Math.sin(t * 0.3 + mote.phase) * mote.sway +
            pointer.x * 26 * mote.depth;
          const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.8 + mote.phase * 3));
          ctx.globalAlpha = twinkle * 0.8;
          const size = mote.size * 4;
          ctx.drawImage(moteSprite, x - size / 2, y - 40 - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
      }
    }

    function frame(now: number) {
      if (!active) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;
      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;
      draw(time);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (active || reduced.matches) return;
      active = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      active = false;
      cancelAnimationFrame(raf);
    }

    function resize() {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      sky = ctx
        ? (() => {
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, "#dcebe7");
            gradient.addColorStop(0.38, "#eef0e4");
            gradient.addColorStop(0.62, "#f8ecd4");
            gradient.addColorStop(1, "#f4e3c2");
            return gradient;
          })()
        : null;
      if (reduced.matches) draw(time);
    }

    buildSprites();
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const viewObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0 },
    );
    viewObserver.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPointer = (event: PointerEvent) => {
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const onPreference = () => {
      if (reduced.matches) {
        stop();
        draw(time);
      } else {
        start();
      }
    };
    reduced.addEventListener("change", onPreference);
    onPreference();

    return () => {
      stop();
      resizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      reduced.removeEventListener("change", onPreference);
    };
  }, []);

  return <canvas ref={ref} className={`dawn-canvas ${className}`} aria-hidden="true" />;
}

const PROMPT_EXAMPLES = [
  "两人周末自驾露营一晚，预算 2000 元，帮我配帐篷和睡眠装备…",
  "准备一天的近郊徒步，已有徒步鞋，预算 700 元，想轻便一点…",
  "想去山里的营地看日出，夜间最低 5°C，需要保暖与照明建议…",
];

/**
 * The liquid-glass entry card. The placeholder itself types and erases example
 * trips until the visitor writes their own; an empty submit carries the
 * example currently on display.
 */
export function HeroPrompt() {
  const [draft, setDraft] = useState("");
  const [example, setExample] = useState("");
  const exampleIndex = useRef(0);
  const engaged = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setExample(PROMPT_EXAMPLES[0]);
      return;
    }
    let timer = 0;
    let char = 0;
    let deleting = false;
    const tick = () => {
      if (engaged.current) return;
      const full = PROMPT_EXAMPLES[exampleIndex.current];
      char += deleting ? -1 : 1;
      setExample(full.slice(0, char));
      let delay = deleting ? 26 : 88;
      if (!deleting && char === full.length) {
        delay = 2600;
        deleting = true;
      } else if (deleting && char === 0) {
        deleting = false;
        exampleIndex.current = (exampleIndex.current + 1) % PROMPT_EXAMPLES.length;
        delay = 420;
      }
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, 700);
    return () => window.clearTimeout(timer);
  }, []);

  const engage = () => {
    engaged.current = true;
  };

  return (
    <form
      action="/chat"
      className="hero-prompt"
      data-hero="card"
      onSubmit={(event) => {
        // An untouched submit starts from the example on display.
        if (draft.trim()) return;
        event.preventDefault();
        window.location.href = assistantLink(example);
      }}
    >
      <label htmlFor="hero-draft" className="sr-only">
        描述你的下一程
      </label>
      <textarea
        id="hero-draft"
        name="draft"
        rows={2}
        maxLength={1200}
        value={draft}
        placeholder={example}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={engage}
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
      <div className="hero-prompt-bar">
        <span className="hero-prompt-hint">行程、人数、预算，随便从哪说起</span>
        <button type="submit" aria-label="带着这段行程进入助手">
          <Arrow />
        </button>
      </div>
    </form>
  );
}

export function TripEntry() {
  return (
    <form action="/chat" className="trip-entry">
      <label htmlFor="trip-draft">你的下一程，想怎么出发？</label>
      <div>
        <input
          id="trip-draft"
          name="draft"
          maxLength={1200}
          required
          placeholder="比如：两人周末露营，预算 2000 元…"
        />
        <button type="submit" aria-label="带着行程进入助手">
          <Arrow />
        </button>
      </div>
    </form>
  );
}

const steps = [
  {
    title: "先把行程说清楚。",
    copy: "人数、季节、预算，还有已经拥有的装备。适合你的选择，从这些小事开始。",
    tags: ["两人出行", "春秋露营", "自驾过夜"],
  },
  {
    title: "每一件，都有选择的理由。",
    copy: "帐篷看空间，睡眠装备看温度与舒适度。把参数放回你的行程里，差异就清楚了。",
    tags: ["空间与重量", "睡眠舒适", "携带方式"],
  },
  {
    title: "把准备，变成一份清单。",
    copy: "看清已经选好的装备、还缺什么和需要注意的地方，再交给助手调整。",
    tags: ["装备组合", "清楚的取舍", "继续调整"],
  },
];

export function PackingStory({ products }: { products: ProductDetails[] }) {
  const [step, setStep] = useState(0);
  const sections = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setStep(Number((entry.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-25% 0px -35% 0px", threshold: 0 },
    );
    sections.current.forEach((element) => {
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);
  return (
    <section
      className="packing-story"
      id="how-it-works"
      aria-label="从行程到装备清单"
      data-reveal
    >
      <div className="packing-narrative">
        {steps.map((item, index) => (
          <div
            className="packing-chapter"
            key={item.title}
            data-step={index}
            data-reveal
            data-reveal-delay={index}
            ref={(element) => {
              sections.current[index] = element;
            }}
          >
            <h2>{item.title}</h2>
            <p>{item.copy}</p>
            <div className="packing-tags">
              {item.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            {index === 2 && (
              <Link
                className="text-link"
                href={assistantLink(
                  "我们两个人准备春秋自驾露营一晚，预计最低 10°C，预算 2000 元，已有餐具。帮我搭配帐篷和睡眠装备。",
                )}
              >
                配一份自己的清单 <Arrow />
              </Link>
            )}
          </div>
        ))}
      </div>
      <div className="packing-sticky">
        <div className="packing-board" data-stage={step}>
          <header>
            <span>周末露营 · 装备桌</span>
            <span>组合示意</span>
          </header>
          <div className="packing-board-products">
            {products.map((product, index) => (
              <Link
                href={`/equipment/${product.product_id}`}
                className={`packing-object packing-object-${index}`}
                key={product.product_id}
              >
                <ProductImage product={product} className="h-full w-full" />
                <span>{product.title}</span>
              </Link>
            ))}
          </div>
          <div className="packing-board-note" aria-live="polite">
            <span className="status-dot" />
            <span>
              {
                [
                  "从一段出行计划开始",
                  "把每件装备放回实际场景",
                  "继续和助手确认数量与规格",
                ][step]
              }
            </span>
          </div>
          <div
            className="packing-progress"
            aria-label={`演示步骤 ${step + 1}，共 3 步`}
          >
            {steps.map((item, index) => (
              <span key={item.title} data-active={index <= step} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Reveal-on-scroll, the header state flip, and the hero's scroll drift:
 * the copy rises out of view a touch slower than the scene recedes.
 */
export function LandingMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header-overlay");
    const hero = document.querySelector<HTMLElement>(".dawn-hero");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    document.documentElement.classList.add("motion-ready");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((element) => {
      revealObserver.observe(element);
    });

    const headerObserver = hero
      ? new IntersectionObserver(
          ([entry]) => {
            header?.classList.toggle("is-scrolled", !entry.isIntersecting);
          },
          { threshold: 0, rootMargin: "-140px 0px 0px 0px" },
        )
      : null;
    if (hero && headerObserver) headerObserver.observe(hero);

    let raf = 0;
    const drift = () => {
      raf = 0;
      if (!hero || reduced.matches) return;
      const progress = Math.min(window.scrollY / window.innerHeight, 1);
      hero.style.setProperty("--hero-drift", progress.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(drift);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const onPreference = () => {
      if (reduced.matches) {
        document.querySelectorAll("[data-reveal]").forEach((element) => {
          element.classList.add("is-visible");
        });
        hero?.style.setProperty("--hero-drift", "0");
      }
    };
    onPreference();
    reduced.addEventListener("change", onPreference);
    return () => {
      reduced.removeEventListener("change", onPreference);
      revealObserver.disconnect();
      headerObserver?.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);
  return null;
}
