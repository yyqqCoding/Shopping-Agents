"use client";

import { useEffect, useRef } from "react";

interface TelemetryCanvasProps {
  activeScene?: string;
  className?: string;
}

/**
 * Organic Mountain Terrain & Atmospheric Mist Canvas.
 * Apple-grade cinematic natural contours and gentle mountain air particles,
 * providing depth and organic breathing motion without visual clutter.
 */
export function TelemetryCanvas({ activeScene = "camping", className = "" }: TelemetryCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    let time = 0;
    let mouseX = -1000;
    let mouseY = -1000;
    let smoothMouseX = -1000;
    let smoothMouseY = -1000;
    let isHovering = false;
    let isVisible = true;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handleResize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      isHovering = true;
    };

    const handleMouseLeave = () => {
      isHovering = false;
      mouseX = -1000;
      mouseY = -1000;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible && !animationFrameId && !prefersReducedMotion) {
          loop();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(canvas);

    // Natural mountain breeze spores
    const particleCount = 36;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * (width || 1200),
      y: Math.random() * (height || 800),
      vx: 0.25 + Math.random() * 0.5,
      vy: (Math.random() - 0.5) * 0.2,
      size: 1.0 + Math.random() * 2.0,
      alpha: 0.12 + Math.random() * 0.25,
      pulse: Math.random() * Math.PI * 2,
    }));

    const render = () => {
      if (!ctx || width === 0 || height === 0) return;

      time += 0.006;

      if (isHovering) {
        smoothMouseX += (mouseX - smoothMouseX) * 0.06;
        smoothMouseY += (mouseY - smoothMouseY) * 0.06;
      } else {
        smoothMouseX += (width * 0.65 - smoothMouseX) * 0.02;
        smoothMouseY += (height * 0.5 - smoothMouseY) * 0.02;
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Organic Mountain Contour Waves (自然高山等高线)
      ctx.save();
      const contourCount = 6;
      const baseY = height * 0.44;

      for (let i = 0; i < contourCount; i++) {
        const progress = i / contourCount;
        const elevationY = baseY + i * 58;

        ctx.beginPath();
        // Delicate pine ink with organic gradient opacity
        ctx.strokeStyle = `rgba(28, 58, 46, ${0.035 + progress * 0.045})`;
        ctx.lineWidth = 1.2;

        const step = 24;
        let started = false;

        for (let x = -20; x <= width + 20; x += step) {
          const wave1 = Math.sin(x * 0.0028 + time * 0.35 + i * 0.9) * 28;
          const wave2 = Math.cos(x * 0.0055 - time * 0.2 + i * 0.6) * 14;

          // Gentle mouse water-ripple gravitational deflection
          const dx = x - smoothMouseX;
          const dy = elevationY - smoothMouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const warpRadius = 260;
          let warp = 0;
          if (dist < warpRadius) {
            const factor = Math.cos((dist / warpRadius) * (Math.PI / 2));
            warp = -factor * 26 * Math.sin(dist * 0.03 - time * 1.5);
          }

          const y = elevationY + wave1 + wave2 + warp;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      ctx.restore();

      // 2. High-Altitude Atmospheric Mist Spores (山岚微风粒子)
      ctx.save();
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy + Math.sin(time + p.pulse) * 0.25;
        p.pulse += 0.025;

        if (p.x > width + 20) p.x = -20;
        if (p.y > height + 20) p.y = -20;
        if (p.y < -20) p.y = height + 20;

        const alpha = p.alpha * (0.6 + Math.sin(p.pulse) * 0.4);
        ctx.fillStyle = `rgba(28, 58, 46, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const loop = () => {
      if (!isVisible || prefersReducedMotion) return;
      render();
      animationFrameId = window.requestAnimationFrame(loop);
    };

    if (!prefersReducedMotion) {
      loop();
    } else {
      render();
    }

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      observer.disconnect();
    };
  }, [activeScene]);

  return (
    <canvas
      ref={canvasRef}
      className={`telemetry-canvas ${className}`}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 2,
      }}
    />
  );
}
