"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { assistantLink } from "@/lib/navigation";
import { Arrow } from "./SiteChrome";

export interface SceneItem {
  sector: string;
  coord: string;
  elev: string;
  tag: string;
  title: string;
  image: string;
  alt: string;
  copy: string;
  specs: string[];
  tilt: number;
  prompt: string;
}

export function InteractiveSceneCard({
  scene,
  index,
}: {
  scene: SceneItem;
  index: number;
}) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (reduced || !cardRef.current) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = (x / rect.width - 0.5) * 2; // -1 to 1
    const py = (y / rect.height - 0.5) * 2; // -1 to 1

    card.style.setProperty("--rx", `${-py * 8}deg`);
    card.style.setProperty("--ry", `${px * 8}deg`);
    card.style.setProperty("--mx", `${(x / rect.width) * 100}%`);
    card.style.setProperty("--my", `${(y / rect.height) * 100}%`);
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
  };

  return (
    <Link
      ref={cardRef}
      href={assistantLink(scene.prompt)}
      className="scene luxury-scene-card interactive-tilt-card"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        {
          "--tilt": `${scene.tilt}deg`,
          "--i": index,
        } as React.CSSProperties
      }
    >
      {/* 3D Sheen reflection */}
      <div className="card-ambient-refraction" aria-hidden="true" />

      {/* Sector Badge */}
      <div className="scene-telemetry-badge">
        <span className="badge-sector">{scene.sector}</span>
        <span className="badge-elev">{scene.elev}</span>
      </div>

      <span className="print scene-print luxury-scene-print" data-land>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/images/${scene.image}.webp`}
          alt={scene.alt}
          loading="lazy"
          width={1024}
          height={1536}
        />
        <div className="card-liquid-sheen" aria-hidden="true" />
      </span>

      <span className="scene-caption luxury-scene-caption">
        <div className="scene-tag-line">
          <span className="scene-coords-mark">{scene.coord}</span>
          <span className="scene-tag-text">{scene.tag}</span>
        </div>
        <strong className="scene-card-title">{scene.title}</strong>
        <span className="scene-card-copy">{scene.copy}</span>

        <span className="scene-specs-row">
          {scene.specs.map((spec) => (
            <span key={spec} className="scene-spec-pill">
              {spec}
            </span>
          ))}
        </span>

        <span className="scene-go luxury-scene-go">
          <span>从这里聊起</span>
          <span className="scene-go-icon">
            <Arrow />
          </span>
        </span>
      </span>
    </Link>
  );
}
