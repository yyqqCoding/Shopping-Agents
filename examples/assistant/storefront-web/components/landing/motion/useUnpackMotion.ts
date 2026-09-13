"use client";

import { useEffect, useRef, type RefObject } from "react";
import { gsap, ScrollTrigger } from "./gsapSetup";

/** One reversible scroll performance: the backpack opens, then four gear chapters take turns. */
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
      const firstChapterStart = 0.72;
      const chapterGap = 2.2;

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
        const running =
          visible &&
          !document.hidden &&
          page.dataset.motionPaused !== "true" &&
          (!sequence || sequence.progress() < 0.025);
        if (!running && hero.dataset.active === "true") resetTilt?.();
        hero.dataset.active = String(running);
        if (intro && intro.progress() < 1) {
          if (sequence && sequence.progress() >= 0.025) intro.progress(1);
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
          onUpdate: () => updatePhase(sequence.progress() * 10),
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: () => "+=" + h() * 12.2,
            pin: true,
            scrub: 0.16,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: updatePlayback,
          },
        });

        sequence
          .to(
            ".field-hero-title > span:first-child",
            { xPercent: -75, y: -60, opacity: 0, duration: 0.55 },
            0.2,
          )
          .to(
            ".field-hero-title > span:last-child",
            { xPercent: 75, y: 80, opacity: 0, duration: 0.55 },
            0.2,
          )
          .to(
            ".field-hero-note, .field-scroll, .field-hero-bottom",
            { opacity: 0, y: -25, duration: 0.35 },
            0.22,
          )
          .to(
            bag,
            { scale: 1.08, rotation: -5, y: () => h() * 0.045, duration: 0.5 },
            0,
          )
          .to(".field-bag-closed", { opacity: 0, duration: 0.3 }, 0.28)
          .fromTo(
            ".field-bag-open",
            { opacity: 0, y: 18 },
            { opacity: 1, y: 0, duration: 0.32 },
            0.28,
          )
          .fromTo(
            ".field-bag-front",
            { opacity: 0 },
            { opacity: 1, duration: 0.28 },
            0.32,
          )
          .to(
            bag,
            {
              x: () => -stage.clientWidth * 0.26,
              y: () => h() * 0.07,
              scale: 0.5,
              rotation: 0,
              duration: 0.72,
              ease: "power3.inOut",
            },
            0.5,
          )
          .fromTo(
            ".field-chapter-rail",
            { opacity: 0, x: -22 },
            { opacity: 1, x: 0, duration: 0.6 },
            0.62,
          )
          .to(
            ".field-bag-shell",
            {
              opacity: 0,
              scale: 0.82,
              y: 24,
              duration: 0.52,
              ease: "power3.in",
            },
            0.92,
          );

        chapters.forEach((chapter, chapterIndex) => {
          const start = firstChapterStart + chapterIndex * chapterGap;
          const variants = Array.from(
            chapter.querySelectorAll<HTMLElement>("[data-chapter-variant]"),
          );
          if (chapterIndex > 0) {
            sequence.to(
              chapters[chapterIndex - 1],
              { opacity: 0, yPercent: -10, duration: 0.52 },
              start - 0.18,
            );
          }

          sequence.fromTo(
            chapter,
            {
              opacity: 0,
              yPercent: 12,
              scale: 0.985,
              clipPath: "inset(12% 0 0 0)",
            },
            {
              opacity: 1,
              yPercent: 0,
              scale: 1,
              clipPath: "inset(0% 0 0 0)",
              duration: 0.72,
              ease: "power3.out",
            },
            start,
          );
          sequence.to(
            bag,
            {
              y: () => h() * (0.07 + (chapterIndex % 2) * 0.012),
              rotation: chapterIndex % 2 ? 2.5 : -2.5,
              duration: 0.42,
              ease: "back.out(1.8)",
            },
            start,
          );
          sequence.to(
            bag,
            { rotation: 0, duration: 0.5, ease: "sine.out" },
            start + 0.42,
          );

          variants.forEach((variant, variantIndex) => {
            const isPrimary = variantIndex === 0;
            const variantStart = start + 0.12 + variantIndex * 0.17;
            sequence.fromTo(
              variant,
              {
                opacity: 0,
                x: () => -stage.clientWidth * (0.42 - variantIndex * 0.035),
                y: () => h() * (0.08 + variantIndex * 0.035),
                scale: isPrimary ? 0.12 : 0.08,
                rotation: variantIndex % 2 ? 22 : -24,
              },
              {
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                rotation: isPrimary ? 0 : variantIndex % 2 ? 3 : -3,
                duration: isPrimary ? 1.12 : 0.92,
                ease: isPrimary ? "back.out(1.7)" : "power3.out",
              },
              variantStart,
            );
          });

          sequence
            .fromTo(
              chapter.querySelector<HTMLElement>(".field-chapter-copy")!,
              { opacity: 0, x: -42 },
              { opacity: 1, x: 0, duration: 0.65, ease: "power3.out" },
              start + 0.3,
            )
            .fromTo(
              chapter.querySelector<HTMLElement>(".field-chapter-info")!,
              { opacity: 0, y: 34 },
              { opacity: 1, y: 0, duration: 0.64, ease: "power3.out" },
              start + 0.62,
            )
            .fromTo(
              chapter.querySelectorAll<HTMLElement>(
                ".field-chapter-specs span",
              ),
              { opacity: 0, y: 18 },
              { opacity: 1, y: 0, duration: 0.42, stagger: 0.08 },
              start + 0.83,
            )
            .fromTo(
              chapter.querySelector<HTMLElement>(".field-chapter-progress i")!,
              { scaleX: 0 },
              { scaleX: 1, duration: 1.5, ease: "none" },
              start + 0.7,
            );
        });

        sequence.to({}, { duration: 1.2 }, 10.05);
        setPhase(0);
      }, page);

      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        updatePlayback();
      });
      observer.observe(stage);
      document.addEventListener("visibilitychange", updatePlayback);

      const navigate = (event: MouseEvent) => {
        const link = (event.target as Element).closest<HTMLAnchorElement>(
          'a[href^="#chapter-"]',
        );
        if (
          !link ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const chapterIndex = chapters.findIndex(
          (chapter) => `#${chapter.id}` === link.hash,
        );
        if (chapterIndex < 0) return;
        event.preventDefault();
        const trigger = sequence.scrollTrigger!;
        const position = firstChapterStart + chapterIndex * chapterGap;
        window.scrollTo({
          top: trigger.start + ((trigger.end - trigger.start) * position) / 10,
          behavior: "smooth",
        });
        history.replaceState(null, "", link.hash);
      };
      page.addEventListener("click", navigate);

      const tilt = get(".field-hero-tilt");
      const pointer = (event: PointerEvent) => {
        if (hero.dataset.active !== "true") return;
        const bounds = stage.getBoundingClientRect();
        const dx = (event.clientX / bounds.width - 0.5) * 2;
        const dy = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
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

      Promise.all(
        Array.from(stage.querySelectorAll<HTMLImageElement>("img"), (image) =>
          image.decode().catch(() => {}),
        ),
      ).then(() => {
        if (!disposed) ScrollTrigger.refresh();
      });

      return () => {
        disposed = true;
        playback.current = null;
        observer.disconnect();
        document.removeEventListener("visibilitychange", updatePlayback);
        page.removeEventListener("click", navigate);
        stage.removeEventListener("pointermove", pointer);
        stage.removeEventListener("pointerleave", reset);
        gsap.killTweensOf(tilt);
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
