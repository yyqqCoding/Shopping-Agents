"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { ProductImage } from "./ProductTile";
import { Arrow } from "./SiteChrome";

/*
 * The welcome table. A trip is typed onto the paper slip; as the words arrive
 * the trip's equipment prints land on the ground cloth and the packing list
 * beside them ticks itself. Three example trips cycle until the visitor takes
 * the slip; the landscape follows the trip. An empty submit carries the
 * example on display into the chat.
 */

const HERO_SCENES = {
  camping: { label: "林间露营", image: "/images/camping.webp" },
  hiking: { label: "轻装徒步", image: "/images/hiking.webp" },
  sunrise: { label: "山间日出", image: "/images/hero.webp" },
};

export type HeroKit = {
  scene: keyof typeof HERO_SCENES;
  prompt: string;
  budget: number | null;
  items: { product: ProductDetails; qty: number }[];
  pending: { product: ProductDetails; note: string };
};

const TYPE_MS = 55;
const ERASE_MS = 16;
const HOLD_MS = 4200;
const REST_MS = 400;

function yuan(n: number) {
  return `¥${n.toLocaleString("zh-CN")}`;
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
  // The cloth keeps the previous trip's prints until the next trip's first
  // print lands, so the table is never bare between examples.
  const [stage, setStage] = useState({ kit: 0, landed: 0 });
  const [settled, setSettled] = useState(false);
  const [playback, setPlayback] = useState({ start: 0, playing: true });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [active, setActive] = useState(true);

  const current = kits[kit];
  const example = current.prompt.slice(0, chars);
  const count = current.items.length;
  const landed = stage.kit === kit ? stage.landed : 0;
  const playing = playback.playing && !reducedMotion;
  const playbackLabel = playing ? "暂停场景演示" : "播放场景演示";
  const playbackHint = reducedMotion
    ? "已跟随系统减少动态效果"
    : focused || draft.length > 0
      ? "填写行程时暂停演示"
      : playbackLabel;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let index = playback.start;
    let c = 0;
    let deleting = false;
    let timer = 0;
    let inView = true;
    const finish = (index: number) => {
      setKit(index);
      setChars(kits[index].prompt.length);
      setStage({ kit: index, landed: kits[index].items.length });
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
        const per = full.length / (n + 0.4);
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

  // Pointer depth stays outside React's render cycle. Only an active movement
  // requests frames; leaving the scene eases the equipment back to its rest.
  useEffect(() => {
    const scene = sceneRef.current;
    if (
      !scene ||
      !active ||
      reducedMotion ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) return;
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
      className="hero-experience"
      data-playing={playing}
      data-active={active}
    >
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
      </div>
      <div className="table" data-playing={playing}>
        <div className="table-words">
          {children}
          <form
            action="/chat"
            className="slip"
            data-hero="slip"
            onSubmit={(event) => {
              // An untouched submit starts from the example on display.
              if (draft.trim()) return;
              event.preventDefault();
              window.location.href = assistantLink(current.prompt);
            }}
          >
            <label htmlFor="hero-draft" className="sr-only">
              描述你的下一程
            </label>
            <div className="slip-field">
              <textarea
                id="hero-draft"
                name="draft"
                rows={2}
                maxLength={1200}
                value={draft}
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
              {/* The example writes itself with a pen cursor until the visitor takes over. */}
              <span
                className="slip-example"
                aria-hidden="true"
                data-hidden={focused || draft.length > 0}
              >
                {example}
              </span>
            </div>
            <button type="submit" aria-label="带着这段行程进入助手">
              <Arrow />
            </button>
          </form>
          <div className="table-scenes" data-hero="scenes">
            <div
              className="table-scene-options"
              role="group"
              aria-label="切换示例行程和背景"
            >
              {kits.map(({ scene }, index) => (
                <button
                  key={scene}
                  type="button"
                  aria-pressed={index === kit}
                  onClick={() => setPlayback({ start: index, playing: false })}
                >
                  {HERO_SCENES[scene].label}
                </button>
              ))}
            </div>
            <button
              className="table-playback"
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
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                ) : (
                  <path d="m7 4 9 6-9 6V4Z" fill="currentColor" />
                )}
              </svg>
            </button>
          </div>
        </div>

        <div className="table-cloth" data-hero="cloth">
          <div className="table-prints" aria-hidden="true">
            {kits.map((entry, k) =>
              entry.items.map(({ product }, index) => (
                <div
                  className={`print table-print table-print-${index}`}
                  key={`${k}-${product.product_id}`}
                  data-landed={stage.kit === k && index < stage.landed}
                >
                  <ProductImage
                    product={product}
                    sizes="(max-width: 820px) 44vw, 420px"
                  />
                </div>
              )),
            )}
          </div>

          <div className="paper packing-list" data-settled={settled}>
            <header>
              <span>出发清单</span>
              <span>{settled ? `${count} 件已摊开` : `${landed} / ${count}`}</span>
            </header>
            <ol>
              {current.items.map(({ product, qty }, index) => (
                <li key={product.product_id} data-checked={index < landed}>
                  <span className="tick" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="20" height="20">
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
                  <span className="packing-name">
                    {product.title}
                    {qty > 1 ? <em> ×{qty}</em> : null}
                  </span>
                  <span className="packing-price">{yuan(product.price * qty)}</span>
                </li>
              ))}
              <li className="packing-pending" data-shown={settled}>
                <span className="tick" aria-hidden="true" />
                <span className="packing-name">
                  还缺 {current.pending.product.title}
                  <em>{current.pending.note}</em>
                </span>
                <span className="packing-price">{yuan(current.pending.product.price)}</span>
              </li>
            </ol>
            <footer>
              <span>合计</span>
              <strong>
                {landed > 0 ? yuan(total) : "—"}
                {current.budget ? <span> / 预算 {yuan(current.budget)}</span> : null}
              </strong>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TripEntry() {
  return (
    <form action="/chat" className="trip-entry paper">
      <label htmlFor="trip-draft">你的下一程，写在这里。</label>
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
      className="print gear-print"
      data-land
      style={{ "--tilt": `${tilt}deg`, "--i": index } as React.CSSProperties}
      aria-label={`查看${product.title}`}
    >
      <ProductImage product={product} priority={priority} sizes="(max-width: 820px) 46vw, 380px" />
    </Link>
  );
}

/**
 * Reveal-on-scroll and the header state flip. Prints land once as they enter;
 * headings rise; nothing animates twice. Elements already inside the first
 * viewport are marked visible before the motion class lands, so hydration
 * never blinks them.
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
          -5,
          Math.min(5, ((event.clientX - bounds.left) / bounds.width - 0.5) * 10),
        );
        const y = Math.max(
          -4,
          Math.min(4, ((event.clientY - bounds.top) / bounds.height - 0.5) * 8),
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
      observer.disconnect();
      window.removeEventListener("scroll", syncHeader);
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);
  return null;
}
