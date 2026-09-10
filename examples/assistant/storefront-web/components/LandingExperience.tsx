"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { ProductImage } from "./ProductTile";
import { Arrow } from "./SiteChrome";

/*
 * The welcome table. A trip is typed onto the paper slip; as the words arrive
 * the trip's equipment prints land on the ground cloth and the packing list
 * beside them ticks itself. Three example trips cycle until the visitor takes
 * the slip; an empty submit carries the example on display into the chat.
 */

export type HeroKit = {
  prompt: string;
  budget: number | null;
  items: { product: ProductDetails; qty: number }[];
  pending: { product: ProductDetails; note: string };
};

const TYPE_MS = 72;
const ERASE_MS = 20;
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
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [kit, setKit] = useState(0);
  const [chars, setChars] = useState(0);
  // The cloth keeps the previous trip's prints until the next trip's first
  // print lands, so the table is never bare between examples.
  const [stage, setStage] = useState({ kit: 0, landed: 0 });
  const [settled, setSettled] = useState(false);
  const engaged = useRef(false);

  const current = kits[kit];
  const example = current.prompt.slice(0, chars);
  const count = current.items.length;
  const landed = stage.kit === kit ? stage.landed : 0;

  useEffect(() => {
    const finish = (index: number) => {
      setKit(index);
      setChars(kits[index].prompt.length);
      setStage({ kit: index, landed: kits[index].items.length });
      setSettled(true);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish(0);
      return;
    }
    let index = 0;
    let c = 0;
    let deleting = false;
    let timer = 0;
    const tick = () => {
      if (engaged.current) {
        finish(index);
        return;
      }
      const full = kits[index].prompt;
      const n = kits[index].items.length;
      let delay = deleting ? ERASE_MS : TYPE_MS;
      c += deleting ? -1 : 1;
      setChars(c);
      if (!deleting) {
        const per = full.length / (n + 0.4);
        const now = Math.min(n, Math.floor(c / per));
        if (now > 0) setStage({ kit: index, landed: now });
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
    timer = window.setTimeout(tick, 400);
    return () => window.clearTimeout(timer);
  }, [kits]);

  const engage = () => {
    engaged.current = true;
    setFocused(true);
  };

  const chosen = current.items.slice(0, landed);
  const total = chosen.reduce(
    (sum, { product, qty }) => sum + product.price * qty,
    0,
  );

  return (
    <div className="table">
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
    const hero = document.querySelector<HTMLElement>(".welcome-table");
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

    const headerObserver =
      hero && header
        ? new IntersectionObserver(
            ([entry]) => header.classList.toggle("is-scrolled", !entry.isIntersecting),
            { threshold: 0, rootMargin: "-96px 0px 0px 0px" },
          )
        : null;
    if (hero) headerObserver?.observe(hero);

    const onPreference = () => {
      if (reduced.matches) targets.forEach((element) => element.classList.add("is-visible"));
    };
    onPreference();
    reduced.addEventListener("change", onPreference);
    return () => {
      reduced.removeEventListener("change", onPreference);
      observer.disconnect();
      headerObserver?.disconnect();
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);
  return null;
}
