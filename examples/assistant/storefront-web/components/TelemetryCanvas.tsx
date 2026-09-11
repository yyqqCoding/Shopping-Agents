"use client";

import { useEffect, useRef } from "react";

interface TelemetryCanvasProps {
  activeScene?: string;
  className?: string;
}

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

    // Tactical state
    let time = 0;
    let mouseX = -1000;
    let mouseY = -1000;
    let smoothMouseX = -1000;
    let smoothMouseY = -1000;
    let isHovering = false;
    let isVisible = true;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Resize handler with High-DPI support
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

    // Mouse movement tracking
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

    // Visibility handling
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

    // Weather & Wind Vector Particles
    const particleCount = 45;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * (width || 1200),
      y: Math.random() * (height || 800),
      vx: 0.4 + Math.random() * 0.9,
      vy: (Math.random() - 0.5) * 0.3,
      size: 1.2 + Math.random() * 1.8,
      alpha: 0.15 + Math.random() * 0.35,
      pulse: Math.random() * Math.PI * 2,
    }));

    // Radar scan beam angle
    let scanAngle = 0;

    // Render loop
    const render = () => {
      if (!ctx || width === 0 || height === 0) return;

      time += 0.008;
      scanAngle = (scanAngle + 0.012) % (Math.PI * 2);

      // Smooth mouse lerp
      if (isHovering) {
        smoothMouseX += (mouseX - smoothMouseX) * 0.08;
        smoothMouseY += (mouseY - smoothMouseY) * 0.08;
      } else {
        smoothMouseX += ((width * 0.72) - smoothMouseX) * 0.03;
        smoothMouseY += ((height * 0.48) - smoothMouseY) * 0.03;
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Tactical Micro Grid & Coordinate Ticks
      ctx.save();
      const gridSize = 80;
      const startX = (width % gridSize) / 2;
      const startY = (height % gridSize) / 2;

      ctx.strokeStyle = "rgba(28, 58, 46, 0.04)";
      ctx.lineWidth = 1;

      // Draw subtle grid crosshairs at intersections
      for (let x = startX; x < width; x += gridSize) {
        for (let y = startY; y < height; y += gridSize) {
          const cross = 3;
          ctx.beginPath();
          ctx.moveTo(x - cross, y);
          ctx.lineTo(x + cross, y);
          ctx.moveTo(x, y - cross);
          ctx.lineTo(x, y + cross);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 2. Dynamic Topographic Contour Field (等高线生成系统)
      ctx.save();
      const contourCount = 8;
      const baseY = height * 0.42;

      for (let i = 0; i < contourCount; i++) {
        const progress = i / contourCount;
        const elevationY = baseY + i * 52;
        const isAccent = i === 3 || i === 6;

        ctx.beginPath();
        if (isAccent) {
          ctx.strokeStyle = "rgba(216, 84, 28, 0.22)"; // Tactical safety orange
          ctx.lineWidth = 1.4;
          ctx.setLineDash([8, 6, 2, 6]);
        } else {
          ctx.strokeStyle = `rgba(28, 58, 46, ${0.05 + progress * 0.07})`;
          ctx.lineWidth = 1.1;
          ctx.setLineDash([]);
        }

        const step = 20;
        let started = false;

        for (let x = -20; x <= width + 20; x += step) {
          // Complex synthetic mountain contour waves
          const wave1 = Math.sin(x * 0.0035 + time * 0.4 + i * 0.8) * 32;
          const wave2 = Math.cos(x * 0.007 - time * 0.25 + i * 0.5) * 18;
          const wave3 = Math.sin(x * 0.012 + i * 1.2) * 8;

          // Mouse warp gravitational well (鼠标引力透镜扭曲)
          const dx = x - smoothMouseX;
          const dy = elevationY - smoothMouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const warpRadius = 240;
          let warp = 0;
          if (dist < warpRadius) {
            const factor = Math.cos((dist / warpRadius) * (Math.PI / 2));
            warp = -factor * 34 * Math.sin(dist * 0.04 - time * 2);
          }

          const y = elevationY + wave1 + wave2 + wave3 + warp;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Add contour elevation label on accent curves
        if (isAccent && width > 900) {
          const labelX = width * (0.18 + i * 0.12);
          const labelY = elevationY + Math.sin(labelX * 0.0035 + time * 0.4 + i * 0.8) * 32;
          ctx.save();
          ctx.font = "9px 'Courier New', monospace";
          ctx.fillStyle = "rgba(216, 84, 28, 0.65)";
          ctx.fillText(`ELV +${1280 + i * 140}M // CONTOUR_${i + 1}`, labelX, labelY - 5);
          ctx.restore();
        }
      }
      ctx.restore();

      // 3. Tactical Radar Compass & Sonar Reticle at Focus Anchor
      ctx.save();
      const focalX = smoothMouseX;
      const focalY = smoothMouseY;

      // Outer radar range circle
      ctx.beginPath();
      ctx.strokeStyle = "rgba(28, 58, 46, 0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.arc(focalX, focalY, 90, 0, Math.PI * 2);
      ctx.stroke();

      // Inner tactical reticle
      ctx.beginPath();
      ctx.strokeStyle = "rgba(216, 84, 28, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.arc(focalX, focalY, 36, 0, Math.PI * 2);
      ctx.stroke();

      // Sweeping radar scan line
      ctx.beginPath();
      ctx.strokeStyle = "rgba(216, 84, 28, 0.28)";
      ctx.lineWidth = 1.5;
      ctx.moveTo(focalX, focalY);
      ctx.lineTo(
        focalX + Math.cos(scanAngle) * 90,
        focalY + Math.sin(scanAngle) * 90
      );
      ctx.stroke();

      // Corner target brackets
      const bracketSize = 14;
      const offset = 48;
      ctx.strokeStyle = "rgba(28, 58, 46, 0.4)";
      ctx.lineWidth = 1.5;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(focalX - offset, focalY - offset + bracketSize);
      ctx.lineTo(focalX - offset, focalY - offset);
      ctx.lineTo(focalX - offset + bracketSize, focalY - offset);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(focalX + offset - bracketSize, focalY - offset);
      ctx.lineTo(focalX + offset, focalY - offset);
      ctx.lineTo(focalX + offset, focalY - offset + bracketSize);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(focalX - offset, focalY + offset - bracketSize);
      ctx.lineTo(focalX - offset, focalY + offset);
      ctx.lineTo(focalX - offset + bracketSize, focalY + offset);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(focalX + offset - bracketSize, focalY + offset);
      ctx.lineTo(focalX + offset, focalY + offset);
      ctx.lineTo(focalX + offset, focalY + offset - bracketSize);
      ctx.stroke();

      // Micro telemetry text beside reticle
      if (width > 800) {
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
        ctx.fillStyle = "rgba(28, 58, 46, 0.55)";
        const lat = (31.23 + (focalY / height) * 0.1).toFixed(4);
        const lon = (118.42 + (focalX / width) * 0.15).toFixed(4);
        ctx.fillText(`SYS.RADAR // LOCK [${lat}°N, ${lon}°E]`, focalX + 54, focalY - 24);
        ctx.fillStyle = "rgba(216, 84, 28, 0.7)";
        ctx.fillText(`STAT: SCANNING GEAR ARRAY`, focalX + 54, focalY - 10);
      }

      ctx.restore();

      // 4. Wind Spores & Ambient Flow Particles (高山气流微粒)
      ctx.save();
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy + Math.sin(time + p.pulse) * 0.3;
        p.pulse += 0.03;

        // Wrap around boundaries
        if (p.x > width + 20) p.x = -20;
        if (p.y > height + 20) p.y = -20;
        if (p.y < -20) p.y = height + 20;

        // Particle drawing
        const alpha = p.alpha * (0.6 + Math.sin(p.pulse) * 0.4);
        ctx.fillStyle = `rgba(216, 84, 28, ${alpha})`;
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
      render(); // Single static render for reduced motion
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
