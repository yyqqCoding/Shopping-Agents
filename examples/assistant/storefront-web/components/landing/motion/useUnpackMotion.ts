"use client";

import { useEffect, useRef, type RefObject } from "react";
import { gsap, ScrollTrigger } from "./gsapSetup";

/** One reversible scroll performance: leave the backpack hero and enter four outdoor chapters. */
export function useUnpackMotion(
  root: RefObject<HTMLElement | null>,
  paused: boolean,
) {
  const playback = useRef<(() => void) | null>(null);
  useEffect(() => playback.current?.(), [paused]);

  useEffect(() => {
    const page = root.current;
    if (!page) return;

    const media = gsap.matchMedia();
    let alive = true;
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const get = (selector: string) =>
        page.querySelector<HTMLElement>(selector)!;
      const stage = get(".field-unpack-stage");
      const hero = get(".field-hero");
      const bag = get("[data-hero-object]");
      const chapters = Array.from(
        stage.querySelectorAll<HTMLElement>("[data-chapter]"),
      );
      const sections = [hero, ...chapters];
      const originals = Array.from(
        stage.querySelectorAll<HTMLElement>("*"),
        (element) => [element, element.getAttribute("style")] as const,
      );
      page.classList.add("is-unpacking");
      hero.dataset.motion = "enabled";

      let visible = true;
      let disposed = false;
      let sequence: gsap.core.Timeline;
      let intro: gsap.core.Timeline;
      let phase = -1;
      let resetTilt: (() => void) | null = null;
      const firstChapterStart = 0.32;
      const chapterGap = 2.45;

      const setPhase = (next: number) => {
        if (phase === next) return;
        phase = next;
        sections.forEach((section, index) => {
          section.inert = index !== next;
          section.dataset.active = String(index === next);
        });
      };
      const updatePhase = (progress: number) => {
        if (progress < firstChapterStart) setPhase(0);
        else {
          const index = Math.min(
            chapters.length - 1,
            Math.floor((progress - firstChapterStart) / chapterGap),
          );
          setPhase(index + 1);
        }
      };

      const updatePlayback = () => {
        const sceneRunning =
          visible &&
          !document.hidden &&
          page.dataset.motionPaused !== "true";
        page.dataset.scenePlayback = sceneRunning ? "running" : "paused";
        const atHero = !sequence || sequence.time() < 0.06;
        const running = sceneRunning && atHero;
        if (!running && hero.dataset.active === "true") resetTilt?.();
        hero.dataset.active = String(running);
        if (intro && intro.progress() < 1) {
          if (!atHero) intro.progress(1);
          else running ? intro.play() : intro.pause();
        }
      };
      playback.current = updatePlayback;

      const context = gsap.context(() => {
        intro = gsap
          .timeline({
            onComplete: () => {
              hero.dataset.entered = "true";
            },
          })
          .from(".field-hero-arrival", {
            y: 150,
            rotation: -22,
            scale: 0.68,
            duration: 1.65,
            ease: "expo.out",
          })
          .from(
            ".field-hero-title > span",
            {
              clipPath: "inset(0 0 100% 0)",
              duration: 1.1,
              stagger: 0.12,
              ease: "expo.out",
            },
            0.15,
          );

        const h = () => stage.clientHeight;
        sequence = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          onUpdate: () => updatePhase(sequence.time()),
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: () => "+=" + h() * 9.2,
            pin: true,
            scrub: 0.16,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: updatePlayback,
          },
        });

        sequence
          .fromTo(
            ".field-hero-title",
            { opacity: 1, y: 0 },
            { opacity: 0, y: () => -h() * 0.065, duration: 0.48 },
            0.06,
          )
          .to(
            ".field-scroll",
            { opacity: 0, y: -14, duration: 0.22 },
            0.04,
          )
          .fromTo(
            bag,
            { x: 0, y: 0, scale: 1, rotation: 0 },
            {
              x: () => -stage.clientWidth * 0.075,
              y: () => -h() * 0.11,
              scale: 0.66,
              rotation: -7,
              duration: 1.02,
              ease: "power2.inOut",
            },
            0.06,
          )
          .fromTo(
            ".field-bag-shell",
            { opacity: 1 },
            { opacity: 0, duration: 0.54, ease: "power2.inOut" },
            0.47,
          )
          .fromTo(
            ".field-contours",
            { opacity: 1 },
            { opacity: 0, duration: 0.78 },
            0.18,
          )
          .fromTo(
            hero,
            { autoAlpha: 1 },
            { autoAlpha: 0, duration: 0.08, immediateRender: false },
            1.02,
          );

        chapters.forEach((chapter, chapterIndex) => {
          const start = firstChapterStart + chapterIndex * chapterGap;
          const isFirst = chapterIndex === 0;
          const kind = chapter.dataset.chapterKey;
          const hasPhoto = chapter.classList.contains("field-chapter-photo");
          const variants = Array.from(
            chapter.querySelectorAll<HTMLElement>("[data-chapter-variant]"),
          );

          // Each opaque chapter stays under its successor. Reversing the scroll
          // reveals that complete scene instead of the empty hero backdrop.
          if (chapterIndex > 0) {
            sequence.fromTo(
              chapters[chapterIndex - 1].querySelector<HTMLElement>("[data-chapter-body]"),
              { opacity: 1, y: 0 },
              { opacity: 0, y: -18, duration: 0.4, immediateRender: false },
              start + 0.25,
            );
          }

          // Each material opens differently; all masks fully clear for reading.
          if (isFirst) {
            sequence.fromTo(
              chapter,
              { autoAlpha: 0, clipPath: "circle(0% at 68% 62%)" },
              { autoAlpha: 1, clipPath: "circle(150% at 68% 62%)", duration: 1.05, ease: "power2.inOut" },
              start,
            );
          } else {
            sequence.fromTo(
              chapter,
              {
                autoAlpha: 0,
                clipPath:
                  kind === "light"
                    ? "polygon(52% 53%, 100% 50%, 100% 56%, 52% 53%)"
                    : kind === "sleep" ? "ellipse(75% 0% at 50% 0%)" : "inset(100% 0% 0% 0% round 45% 45% 0 0)",
              },
              {
                autoAlpha: 1,
                clipPath: kind === "light" ? "polygon(-100% -100%, 200% -100%, 200% 200%, -100% 200%)" : kind === "sleep" ? "ellipse(150% 150% at 50% 0%)" : "inset(0% 0% 0% 0% round 0% 0% 0 0)",
                duration: 0.95,
                ease: "power3.out",
              },
              start,
            );
          }
          sequence.fromTo(
            chapter.querySelector<HTMLElement>("[data-chapter-scene]"),
            { scale: isFirst ? 1.055 : hasPhoto ? 1.04 : 1.06 },
            { scale: 1, duration: chapterGap, ease: "none" },
            start,
          );

          variants.forEach((variant, variantIndex) => {
            const isPrimary = variantIndex === 0;
            const variantStart = start + (isFirst ? 0.52 : 0.12) + variantIndex * 0.09;
            const direction = variantIndex % 2 ? 1 : -1;
            const entrance =
              hasPhoto
                ? { x: 0, y: 24, scale: 0.94, rotation: 0 }
                : kind === "sleep"
                  ? {
                      x: () => direction * stage.clientWidth * 0.06,
                      y: () => h() * 0.09,
                      scale: 0.86,
                      rotation: direction * 15,
                    }
                  : { x: 65, y: 0, scale: 0.92, rotation: 0 };
            sequence.fromTo(
              variant,
              {
                opacity: 0,
                ...entrance,
              },
              {
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                rotation: 0,
                duration: hasPhoto ? 0.6 : isPrimary ? 1.08 : 0.86,
                ease: "power3.out",
              },
              variantStart,
            );
          });

          sequence
            .fromTo(
              chapter.querySelector<HTMLElement>(".field-chapter-topline"),
              { opacity: 0, y: -12 },
              { opacity: 1, y: 0, duration: 0.5 },
              start + (isFirst ? 0.52 : 0.2),
            )
            .fromTo(
              chapter.querySelector<HTMLElement>(".field-chapter-copy")!,
              { opacity: 0, x: -42 },
              { opacity: 1, x: 0, duration: 0.65, ease: "power3.out" },
              start + (isFirst ? 0.78 : 0.3),
            )
            .fromTo(
              chapter.querySelector<HTMLElement>(".field-chapter-info")!,
              { opacity: 0, y: 34 },
              { opacity: 1, y: 0, duration: 0.64, ease: "power3.out" },
              start + (isFirst ? 0.82 : 0.62),
            )
            .fromTo(
              chapter.querySelectorAll<HTMLElement>(
                ".field-chapter-specs > div",
              ),
              { opacity: 0, y: 18 },
              { opacity: 1, y: 0, duration: 0.42, stagger: 0.08 },
              start + (isFirst ? 0.98 : 0.83),
            )
            .fromTo(
              chapter.querySelector<HTMLElement>(".field-chapter-progress i")!,
              { scaleX: 0 },
              { scaleX: 1, duration: chapterGap - 0.25, ease: "none" },
              start + 0.25,
            );
        });

        sequence.to({}, { duration: 0.2 });
        setPhase(0);
      }, page);

      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        updatePlayback();
      });
      observer.observe(stage);
      document.addEventListener("visibilitychange", updatePlayback);

      const chapterPosition = (hash: string) => {
        const chapterIndex = chapters.findIndex(
          (chapter) => `#${chapter.id}` === hash,
        );
        if (chapterIndex < 0) return null;
        const trigger = sequence.scrollTrigger!;
        const position = firstChapterStart + chapterIndex * chapterGap + 1.5;
        return trigger.start + ((trigger.end - trigger.start) * position) / sequence.duration();
      };
      const navigate = (event: MouseEvent) => {
        const link = (event.target as Element).closest<HTMLAnchorElement>(
          'a[href^="#chapter-"]',
        );
        if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        const position = chapterPosition(link.hash);
        if (position === null) return;
        event.preventDefault();
        window.scrollTo({
          top: position,
          behavior: "smooth",
        });
        history.replaceState(null, "", link.hash);
      };
      page.addEventListener("click", navigate);

      const tilt = get(".field-hero-tilt");
      const beam = get(".field-light-beam");
      const pointer = (event: PointerEvent) => {
        if (page.dataset.scenePlayback !== "running") return;
        const bounds = stage.getBoundingClientRect();
        const dx = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
        const dy = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
        if (chapters[phase - 1]?.dataset.chapterKey === "light") {
          gsap.to(beam, {
            rotation: -26 + dy * 17 + dx * 8,
            duration: 0.7,
            ease: "power3.out",
            overwrite: true,
          });
        }
        if (hero.dataset.active !== "true") return;
        gsap.to(tilt, {
          rotationY: dx * 9,
          rotationX: -dy * 4,
          rotation: dx * 2,
          x: dx * 14,
          duration: 0.55,
          overwrite: true,
        });
      };
      const reset = () => {
        gsap.to(beam, { rotation: -26, duration: 0.7, overwrite: true });
        gsap.to(tilt, {
          rotationY: 0,
          rotationX: 0,
          rotation: 0,
          x: 0,
          duration: 0.5,
          overwrite: true,
        });
      };
      resetTilt = reset;
      stage.addEventListener("pointermove", pointer);
      stage.addEventListener("pointerleave", reset);

      // Image boxes have fixed dimensions; lazy chapter images must not gate
      // scroll restoration or force decoding every texture during startup.
      const refreshFrame = requestAnimationFrame(() => {
        if (disposed) return;
        ScrollTrigger.refresh();
        const position = chapterPosition(window.location.hash);
        if (position !== null) window.scrollTo({ top: position, behavior: "instant" });
      });

      return () => {
        disposed = true;
        cancelAnimationFrame(refreshFrame);
        playback.current = null;
        observer.disconnect();
        document.removeEventListener("visibilitychange", updatePlayback);
        page.removeEventListener("click", navigate);
        stage.removeEventListener("pointermove", pointer);
        stage.removeEventListener("pointerleave", reset);
        gsap.killTweensOf([tilt, beam]);
        context.revert();
        originals.forEach(([element, style]) =>
          style === null
            ? element.removeAttribute("style")
            : element.setAttribute("style", style),
        );
        sections.forEach((section) => {
          section.inert = false;
          delete section.dataset.active;
        });
        page.classList.remove("is-unpacking");
        delete page.dataset.scenePlayback;
        delete hero.dataset.motion;
        delete hero.dataset.active;
        delete hero.dataset.entered;
      };
    });

    document.fonts.ready.then(() => {
      if (alive) ScrollTrigger.refresh();
    });
    return () => {
      alive = false;
      media.revert();
    };
  }, [root]);
}
