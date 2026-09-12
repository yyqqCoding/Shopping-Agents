"use client";

/**
 * Landing page motion primitives, ported from the rebuild's home.ts /
 * layout.ts / text.ts:
 * - ovalReveal: elliptical clip-path title unveil with char stagger
 * - ototConverge: two full-height images converging from ±14rem, text from ±4rem
 * - bottomParallax: wide closing image drifting up with a slight scale
 * - columnParallax: grid columns starting at i*5rem offsets, settling on scroll
 * - marqueeLoop: scroll-direction-linked infinite marquee
 */
import { useEffect } from "react";
import { gsap, ScrollTrigger, SplitText } from "./gsapSetup";

function useReduced(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Elliptical clip-path unveil for display headings, chars staggered. */
function ovalReveal(el: HTMLElement): () => void {
  const split = new SplitText(el, { type: "lines,chars", linesClass: "oval-line" });
  const lines = split.lines as HTMLElement[];
  lines.forEach((line) => {
    const wrap = document.createElement("div");
    wrap.className = "oval-line-clip-wrap";
    line.parentNode!.insertBefore(wrap, line);
    wrap.appendChild(line);
  });
  const wraps = el.querySelectorAll<HTMLElement>(".oval-line-clip-wrap");
  wraps.forEach((w) => {
    const line = w.querySelector<HTMLElement>(".oval-line")!;
    gsap.set(w, { clipPath: "ellipse(24% 0% at 50% 100%)" });
    gsap.set(line, { y: "42%" });
  });
  const tl = gsap.timeline({ paused: true });
  tl.to(wraps, {
    clipPath: "ellipse(110% 130% at 50% 100%)",
    duration: 1.4,
    ease: "power3.inOut",
    stagger: 0.12,
  });
  wraps.forEach((w) => {
    gsap.to(w.querySelector(".oval-line"), {
      y: "0%",
      duration: 1.4,
      ease: "power3.inOut",
    });
  });
  const st = ScrollTrigger.create({
    trigger: el,
    start: "top 88%",
    once: true,
    onEnter: () => tl.play(),
  });
  return () => {
    st.kill();
    tl.kill();
    split.revert();
  };
}

/** Two portrait images converge from opposite sides while text columns settle. */
function ototConverge(section: HTMLElement | null) {
  if (!section) return;
  const img1 = section.querySelector("[data-otot-img='1']");
  const img2 = section.querySelector("[data-otot-img='2']");
  const col1 = section.querySelector("[data-otot-col='1']");
  const col2 = section.querySelector("[data-otot-col='2']");
  if (!img1 || !img2 || !col1 || !col2) return;
  gsap.set(img1, { x: "-14rem" });
  gsap.set(img2, { x: "14rem" });
  gsap.set(col1, { x: "-4rem", autoAlpha: 0 });
  gsap.set(col2, { x: "4rem", autoAlpha: 0 });
  gsap.to([img1, img2], {
    x: 0,
    ease: "power2.out",
    scrollTrigger: { trigger: section, start: "top bottom", end: "bottom bottom", scrub: true },
  });
  gsap.to([col1, col2], {
    x: 0,
    autoAlpha: 1,
    ease: "none",
    scrollTrigger: { trigger: section, start: "top 80%", end: "55% bottom", scrub: true },
  });
}

/** Wide closing image drifts up and scales as it passes through the viewport. */
function bottomParallax(section: HTMLElement | null) {
  if (!section) return;
  const img = section.querySelector("img");
  if (!img) return;
  gsap.to(img, {
    y: "-16vh",
    scale: 1.08,
    ease: "none",
    scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: true },
  });
}

/** Grid columns start staggered by i*step and settle into place on scroll. */
function columnParallax(grid: HTMLElement | null, cols = 4, stepRem = 5) {
  if (!grid) return;
  const items = Array.from(grid.querySelectorAll<HTMLElement>("[data-hall-item]"));
  if (!items.length) return;
  const columns: HTMLElement[][] = Array.from({ length: cols }, () => []);
  items.forEach((item, i) => columns[i % cols].push(item));
  columns.forEach((col, i) => {
    if (i === 0) return;
    gsap.set(col, { y: `${i * stepRem}rem` });
    gsap.to(col, {
      y: 0,
      ease: "none",
      scrollTrigger: { trigger: grid, start: "top bottom", end: "bottom top", scrub: true },
    });
  });
}

/** Infinite marquee whose direction follows scroll direction. */
function marqueeLoop(track: HTMLElement | null) {
  if (!track) return;
  const tween = gsap.to(track, {
    xPercent: -50,
    repeat: -1,
    duration: 42,
    ease: "none",
  });
  ScrollTrigger.create({
    trigger: track,
    start: "top bottom",
    end: "bottom top",
    onUpdate: (self) => {
      tween.timeScale(self.direction === 1 ? 1 : -1);
    },
  });
}

/** Root hook: wires every motion region on the landing page. */
export function useLandingMotion(rootRef: React.RefObject<HTMLElement | null>) {
  const reduced = useReduced();

  useEffect(() => {
    if (reduced || !rootRef.current) return;
    const root = rootRef.current;
    const ovalCleanups: (() => void)[] = [];

    const ctx = gsap.context(() => {
      root
        .querySelectorAll<HTMLElement>("[data-oval-title]")
        .forEach((el) => ovalCleanups.push(ovalReveal(el)));
      ototConverge(root.querySelector("[data-otot-stage]"));
      bottomParallax(root.querySelector("[data-otot-bottom]"));
      columnParallax(root.querySelector("[data-hall-grid]"));
      marqueeLoop(root.querySelector("[data-marquee-track]"));
    }, root);

    return () => {
      ovalCleanups.forEach((fn) => fn());
      ctx.revert();
    };
  }, [reduced, rootRef]);
}
