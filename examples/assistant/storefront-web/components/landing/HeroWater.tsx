"use client";

import { useEffect, useRef } from "react";

/** A shared screen-space wave field bends the contours and headline locally. */
export function HeroWater() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest<HTMLElement>(".field-hero");
    const page = hero?.closest<HTMLElement>(".field-home");
    if (!canvas || !hero || !page) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "svg");
    defs.setAttribute("width", "0"); defs.setAttribute("height", "0");
    defs.style.position = "absolute";
    defs.setAttribute("aria-hidden", "true");
    hero.appendChild(defs);
    const targets = [hero.querySelector<HTMLElement>(".field-contours"), hero.querySelector<HTMLElement>(".field-hero-title")]
      .filter((target): target is HTMLElement => Boolean(target));
    const filters = targets.map((target, index) => {
      const filter = document.createElementNS(ns, "filter");
      const id = `hero-water-${index}-${Math.random().toString(36).slice(2)}`;
      filter.id = id;
      filter.setAttribute("filterUnits", "userSpaceOnUse");
      filter.setAttribute("color-interpolation-filters", "sRGB");
      const image = document.createElementNS(ns, "feImage");
      image.setAttribute("result", "wave"); image.setAttribute("preserveAspectRatio", "none");
      const displacement = document.createElementNS(ns, "feDisplacementMap");
      displacement.setAttribute("in", "SourceGraphic"); displacement.setAttribute("in2", "wave");
      displacement.setAttribute("xChannelSelector", "R"); displacement.setAttribute("yChannelSelector", "G");
      displacement.setAttribute("scale", index ? "18" : "26");
      filter.append(image, displacement); defs.appendChild(filter);
      return { target, filter, image, id, original: target.style.filter };
    });
    const width = 180;
    let height = 100;
    const map = document.createElement("canvas");
    const mapContext = map.getContext("2d")!;
    let current = new Float32Array(0), previous = new Float32Array(0), next = new Float32Array(0);
    let frame = 0, lastFrame = 0, lastInput = 0;
    let pointer: { x: number; y: number } | null = null;
    let bounds = hero.getBoundingClientRect();
    const active = () => !document.hidden && !reduced.matches && page.dataset.motionPaused !== "true" &&
      (hero.dataset.active === "true" || !page.classList.contains("is-unpacking"));
    const clear = () => {
      cancelAnimationFrame(frame); frame = 0; pointer = null;
      current.fill(0); previous.fill(0); next.fill(0);
      context.clearRect(0, 0, width, height);
      filters.forEach(({ target, original }) => { target.style.filter = original; });
    };
    const resize = () => {
      clear(); bounds = hero.getBoundingClientRect();
      height = Math.max(60, Math.round(width * bounds.height / bounds.width));
      canvas.width = map.width = width; canvas.height = map.height = height;
      current = new Float32Array(width * height); previous = new Float32Array(width * height); next = new Float32Array(width * height);
    };
    const draw = (time: number) => {
      frame = 0;
      if (!active() || time - lastInput > 2300) { clear(); return; }
      frame = requestAnimationFrame(draw);
      if (time - lastFrame < 30) return;
      lastFrame = time;
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        next[i] = ((current[i-1] + current[i+1] + current[i-width] + current[i+width]) * .5 - previous[i]) * .955;
      }
      [previous, current, next] = [current, next, previous];
      const displacement = mapContext.createImageData(width, height);
      const light = context.createImageData(width, height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x, p = i * 4;
        const dx = x > 0 && x < width-1 ? current[i+1]-current[i-1] : 0;
        const dy = y > 0 && y < height-1 ? current[i+width]-current[i-width] : 0;
        displacement.data[p] = 128 + Math.max(-120, Math.min(120, dx * 100));
        displacement.data[p+1] = 128 + Math.max(-120, Math.min(120, dy * 100));
        displacement.data[p+2] = 128; displacement.data[p+3] = 255;
        const shade = dx * .65 - dy;
        const color = shade > 0 ? 255 : 83;
        light.data[p] = color; light.data[p+1] = color; light.data[p+2] = shade > 0 ? 250 : 91;
        light.data[p+3] = Math.min(30, Math.abs(shade) * 32);
      }
      mapContext.putImageData(displacement, 0, 0); context.putImageData(light, 0, 0);
      const url = map.toDataURL();
      filters.forEach(({ target, filter, image, id }) => {
        const rect = target.getBoundingClientRect();
        filter.setAttribute("x", "-20"); filter.setAttribute("y", "-20");
        filter.setAttribute("width", String(rect.width+40)); filter.setAttribute("height", String(rect.height+40));
        image.setAttribute("x", String(bounds.left-rect.left)); image.setAttribute("y", String(bounds.top-rect.top));
        image.setAttribute("width", String(bounds.width)); image.setAttribute("height", String(bounds.height));
        image.setAttribute("href", url); target.style.filter = `url(#${id})`;
      });
    };
    const move = (event: PointerEvent) => {
      if (!active() || event.pointerType !== "mouse") return;
      bounds = hero.getBoundingClientRect();
      const x = (event.clientX-bounds.left)/bounds.width*width;
      const y = (event.clientY-bounds.top)/bounds.height*height;
      if (x < 0 || x >= width || y < 0 || y >= height) { pointer = null; return; }
      const start = pointer ?? { x, y };
      const distance = Math.hypot(x-start.x,y-start.y);
      const steps = Math.max(1, Math.min(30, Math.ceil(distance)));
      for (let step = 1; step <= steps; step++) {
        const cx = start.x+(x-start.x)*step/steps, cy = start.y+(y-start.y)*step/steps;
        for (let iy = Math.max(1,Math.floor(cy-4)); iy < Math.min(height-1,cy+4); iy++)
          for (let ix = Math.max(1,Math.floor(cx-4)); ix < Math.min(width-1,cx+4); ix++) {
            const force = Math.exp(-((ix-cx)**2+(iy-cy)**2)/5)*.48;
            current[iy*width+ix] = Math.min(2.5,current[iy*width+ix]+force);
          }
      }
      pointer = { x, y }; lastInput = performance.now();
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const leave = () => { pointer = null; };
    const observer = new MutationObserver(() => { if (!active()) clear(); });
    observer.observe(hero, { attributes: true, attributeFilter: ["data-active"] });
    observer.observe(page, { attributes: true, attributeFilter: ["data-motion-paused"] });
    resize();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("resize", resize); window.addEventListener("scroll", clear, { passive: true });
    window.addEventListener("blur", clear); document.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", clear); reduced.addEventListener("change", clear);
    return () => {
      clear(); observer.disconnect(); defs.remove();
      window.removeEventListener("pointermove", move); window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", clear); window.removeEventListener("blur", clear);
      document.removeEventListener("pointerleave", leave); document.removeEventListener("visibilitychange", clear);
      reduced.removeEventListener("change", clear);
    };
  }, []);
  return <canvas ref={canvasRef} className="field-hero-water" aria-hidden="true" />;
}
