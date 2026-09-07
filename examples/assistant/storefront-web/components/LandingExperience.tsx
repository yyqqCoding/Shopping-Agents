"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { ProductImage } from "./ProductTile";
import { Arrow } from "./SiteChrome";

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
      <p>先说个大概，剩下的一起慢慢挑。</p>
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
    >
      <div className="packing-narrative">
        {steps.map((item, index) => (
          <div
            className="packing-chapter"
            key={item.title}
            data-step={index}
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
export function LandingMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header-overlay");
    const onScroll = () =>
      header?.classList.toggle("is-scrolled", window.scrollY > 70);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}
