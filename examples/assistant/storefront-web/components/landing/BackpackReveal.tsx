"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { BackpackWater } from "./motion/backpackWater";

const exteriorUrl = "/images/landing/backpack-packed-exterior.png";
const interiorUrl = "/images/landing/backpack-packed-interior-wide.png";
const SIZE = 1000;
const LIFETIME = 2100;
type Stroke = { x: number; y: number; time: number; angle: number };

function surface() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  return canvas;
}

// The supplied texture has a uniform paper background. Remove only connected
// background pixels, preserving light details enclosed by the pack silhouette.
function exteriorTexture(image: HTMLImageElement) {
  const canvas = surface();
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, SIZE, SIZE);
  const frame = ctx.getImageData(0, 0, SIZE, SIZE);
  const pixels = frame.data;
  const visited = new Uint8Array(SIZE * SIZE);
  const queue = new Int32Array(SIZE * SIZE);
  let head = 0, tail = 0;
  const enqueue = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    const i = index * 4;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r > 215 && g > 212 && b > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 24) {
      queue[tail++] = index;
    }
  };
  for (let i = 0; i < SIZE; i++) {
    enqueue(i); enqueue((SIZE - 1) * SIZE + i);
    enqueue(i * SIZE); enqueue(i * SIZE + SIZE - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    pixels[index * 4 + 3] = 0;
    if (index % SIZE) enqueue(index - 1);
    if (index % SIZE < SIZE - 1) enqueue(index + 1);
    if (index >= SIZE) enqueue(index - SIZE);
    if (index < SIZE * (SIZE - 1)) enqueue(index + SIZE);
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

export function BackpackReveal() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const button = buttonRef.current;
    const canvas = canvasRef.current;
    if (!button || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const hero = button.closest<HTMLElement>(".field-hero")!;
    const page = button.closest<HTMLElement>(".field-home")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const layer = surface();
    const layerContext = layer.getContext("2d")!;
    const mask = surface();
    const maskContext = mask.getContext("2d")!;
    const front = new Path2D();
    // Registered fabric regions; exterior hardware and attachments stay opaque.
    front.moveTo(482, 254);
    front.bezierCurveTo(530, 225, 679, 237, 727, 260);
    front.bezierCurveTo(746, 375, 739, 612, 724, 723);
    front.quadraticCurveTo(619, 752, 485, 724);
    front.closePath();
    front.moveTo(385, 45);
    front.bezierCurveTo(440, 3, 678, 7, 729, 46);
    front.quadraticCurveTo(758, 109, 735, 211);
    front.quadraticCurveTo(608, 236, 450, 224);
    front.quadraticCurveTo(406, 151, 385, 45);
    front.closePath();
    front.moveTo(350, 162); front.lineTo(405, 135);
    front.lineTo(430, 333); front.lineTo(348, 319); front.closePath();
    front.moveTo(353, 368); front.lineTo(430, 386);
    front.lineTo(430, 416); front.lineTo(351, 394); front.closePath();
    front.moveTo(392, 548); front.lineTo(430, 545);
    front.lineTo(439, 715); front.lineTo(371, 774);
    front.quadraticCurveTo(339, 693, 392, 548); front.closePath();
    maskContext.fillStyle = "white";
    maskContext.fill(front);
    const region = surface();
    region.getContext("2d")!.drawImage(mask, 0, 0);
    let water: BackpackWater | null = null;
    let pending: { x: number; y: number; px: number; py: number } | null = null;
    let lastMove = 0;
    let lastFrame = 0;
    let outer: HTMLCanvasElement | null = null;
    let inner: HTMLImageElement | null = null;
    let disposed = false;
    let request = 0;
    let strokes: Stroke[] = [];
    let previous: Stroke | null = null;
    let focusedReveal = false;
    const canReveal = () => !document.hidden && page.dataset.motionPaused !== "true" &&
      (hero.dataset.active === "true" || !page.classList.contains("is-unpacking"));

    const draw = (time: number) => {
      request = 0;
      if (!outer || !inner || disposed) return;
      context.clearRect(0, 0, SIZE, SIZE);
      context.drawImage(outer, 0, 0);
      if (!canReveal()) {
        strokes = []; focusedReveal = false;
        button.setAttribute("aria-pressed", "false");
      }
      if (water) {
        if (!canReveal()) { water.clear(); pending = null; lastMove = 0; }
        if (time - lastMove < LIFETIME && !focusedReveal) {
          if (time - lastFrame >= 14) {
            water.step(pending); pending = null; lastFrame = time;
          }
          request = requestAnimationFrame(draw);
        } else water.clear();
        context.clearRect(0, 0, SIZE, SIZE);
        context.drawImage(water.render(focusedReveal), 0, 0);
        return;
      }
      strokes = strokes.filter((stroke) => time - stroke.time < LIFETIME);
      if (!strokes.length && !focusedReveal) return;
      maskContext.clearRect(0, 0, SIZE, SIZE);
      if (focusedReveal) {
        maskContext.fillStyle = "white";
        maskContext.fill(front);
      } else {
        for (const stroke of strokes) {
          const age = (time - stroke.time) / LIFETIME;
          const radius = 105 * (1 - Math.max(0, age - 0.35) / 0.65) ** 0.6;
          maskContext.save();
          maskContext.translate(stroke.x, stroke.y);
          maskContext.rotate(stroke.angle);
          maskContext.scale(1.13, 0.86);
          const fade = maskContext.createRadialGradient(0, 0, radius * 0.68, 0, 0, radius);
          fade.addColorStop(0, "white");
          fade.addColorStop(1, "transparent");
          maskContext.fillStyle = fade;
          maskContext.beginPath();
          maskContext.arc(0, 0, radius, 0, Math.PI * 2);
          maskContext.fill();
          maskContext.restore();
        }
      }
      layerContext.clearRect(0, 0, SIZE, SIZE);
      layerContext.save();
      layerContext.clip(front);
      layerContext.drawImage(inner, 0, 0, SIZE, SIZE);
      layerContext.globalCompositeOperation = "destination-in";
      layerContext.drawImage(mask, 0, 0);
      layerContext.restore();
      context.drawImage(layer, 0, 0);
      if (strokes.length && !focusedReveal) request = requestAnimationFrame(draw);
    };
    const schedule = () => { if (!request) request = requestAnimationFrame(draw); };
    const reset = () => {
      strokes = []; previous = null; focusedReveal = false;
      pending = null; lastMove = 0; water?.clear();
      button.setAttribute("aria-pressed", "false");
      schedule();
    };
    const move = (event: PointerEvent) => {
      if (!outer || !canReveal() || reduced.matches || !fine.matches || event.pointerType !== "mouse") return;
      // offset coordinates follow the canvas through the existing CSS 3D tilt.
      const x = event.offsetX / button.clientWidth * SIZE;
      const y = event.offsetY / button.clientHeight * SIZE;
      if (!context.isPointInPath(front, x, y)) { previous = null; return; }
      const time = performance.now();
      pending = { x, y, px: pending?.px ?? previous?.x ?? x, py: pending?.py ?? previous?.y ?? y };
      lastMove = time;
      const angle = previous ? Math.atan2(y - previous.y, x - previous.x) : 0;
      const distance = previous ? Math.hypot(x - previous.x, y - previous.y) : 0;
      const steps = Math.min(12, Math.max(1, Math.ceil(distance / 14)));
      for (let step = 1; step <= steps; step++) {
        strokes.push({ x: previous ? previous.x + (x - previous.x) * step / steps : x,
          y: previous ? previous.y + (y - previous.y) * step / steps : y, time, angle });
      }
      previous = { x, y, time, angle };
      strokes = strokes.slice(-70);
      schedule();
    };
    const leave = () => { previous = null; focusedReveal = false; button.setAttribute("aria-pressed", "false"); schedule(); };
    const click = (event: MouseEvent) => {
      // Mouse use stays local; whole-panel inspection is a keyboard / reduced
      // motion alternative, not a second pointer effect.
      if (event.detail > 0 && fine.matches && !reduced.matches) return;
      if (!canReveal()) return;
      focusedReveal = !focusedReveal;
      button.setAttribute("aria-pressed", String(focusedReveal));
      schedule();
    };
    const observe = new MutationObserver(() => { if (!canReveal()) reset(); });
    observe.observe(hero, { attributes: true, attributeFilter: ["data-active"] });
    observe.observe(page, { attributes: true, attributeFilter: ["data-motion-paused"] });
    button.addEventListener("pointermove", move);
    button.addEventListener("pointerleave", leave);
    button.addEventListener("click", click);
    button.addEventListener("blur", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("scroll", reset, { passive: true });
    document.addEventListener("visibilitychange", reset);
    reduced.addEventListener("change", reset);
    const load = async (url: string) => {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      return image;
    };
    Promise.all([load(exteriorUrl), load(interiorUrl)]).then(([outside, inside]) => {
      if (disposed) return;
      outer = exteriorTexture(outside);
      inner = inside;
      try { water = new BackpackWater(outer, inside, region); }
      catch { water = null; } // Soft reveal remains available without WebGL.
      draw(performance.now());
      button.dataset.ready = "true";
    }).catch(() => { /* The original transparent backpack remains visible. */ });
    return () => {
      disposed = true;
      cancelAnimationFrame(request);
      water?.dispose();
      observe.disconnect();
      button.removeEventListener("pointermove", move);
      button.removeEventListener("pointerleave", leave);
      button.removeEventListener("click", click);
      button.removeEventListener("blur", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener("scroll", reset);
      document.removeEventListener("visibilitychange", reset);
      reduced.removeEventListener("change", reset);
      delete button.dataset.ready;
    };
  }, []);

  return (
    <button ref={buttonRef} className="field-pack-reveal" type="button"
      aria-label="查看背包内部装载：睡袋、炊具、食物、衣物、头灯、急救包和地图；水壶与泡沫垫固定在包外"
      aria-pressed="false">
      <Image className="field-pack-fallback" src="/images/landing/backpack-closed-alpha.png"
        alt="" width={1254} height={1254} priority sizes="54vw" />
      <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-hidden="true" />
    </button>
  );
}
