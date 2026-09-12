"use client";

/**
 * Lenis smooth-scroll manager — mirrors the rebuild's scroll.ts:
 * lerp 0.1, smoothWheel, syncTouch, driven by gsap.ticker, feeding
 * ScrollTrigger.update on every scroll event.
 */
import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "./gsapSetup";

export function useLenis(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      touchMultiplier: 1.25,
      autoResize: true,
    });

    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.off("scroll", onScroll);
      lenis.destroy();
    };
  }, [enabled]);
}
