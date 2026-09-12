"use client";

/**
 * Landing page motion primitives, ported from the rebuild's home.ts /
 * layout.ts / text.ts:
 * - ovalReveal: elliptical clip-path title unveil with char stagger
 * - duelStage: diagonal halves counter-parallax, tent plates slide in,
 *   ratio axes grow from zero
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

/** Duel stage: diagonal halves drift in counter-parallax, tent plates slide
 * in from their side, and the ratio axes grow from zero on entry. */
function duelStage(section: HTMLElement | null) {
  if (!section) return;
  const left = section.querySelector("[data-duel-half='left']");
  const right = section.querySelector("[data-duel-half='right']");
  const tents = section.querySelectorAll("[data-duel-tent]");
  const bars = section.querySelectorAll<HTMLElement>(".axis-bar");

  if (left && right) {
    gsap.fromTo(
      left,
      { x: "-4%" },
      {
        x: "2%",
        ease: "none",
        scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: true },
      },
    );
    gsap.fromTo(
      right,
      { x: "4%" },
      {
        x: "-2%",
        ease: "none",
        scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: true },
      },
    );
  }

  tents.forEach((tent, i) => {
    gsap.from(tent, {
      x: i === 0 ? "-5rem" : "5rem",
      autoAlpha: 0,
      y: "2rem",
      duration: 1.1,
      ease: "power3.out",
      scrollTrigger: { trigger: section, start: "top 62%", once: true },
    });
  });

  if (bars.length) {
    gsap.fromTo(
      bars,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 1.2,
        ease: "power3.inOut",
        stagger: 0.12,
        scrollTrigger: { trigger: section, start: "top 48%", once: true },
      },
    );
  }
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
      duelStage(root.querySelector("[data-duel-stage]"));
      columnParallax(root.querySelector("[data-hall-grid]"));
      marqueeLoop(root.querySelector("[data-marquee-track]"));
    }, root);

    return () => {
      ovalCleanups.forEach((fn) => fn());
      ctx.revert();
    };
  }, [reduced, rootRef]);
}
