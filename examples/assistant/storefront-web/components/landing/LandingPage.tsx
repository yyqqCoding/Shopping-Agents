"use client";

import { useRef } from "react";
import type { ProductDetails } from "@/lib/types";
import { useLenis } from "./motion/useLenis";
import { useLandingMotion } from "./motion/useLandingMotion";
import { LandingHero } from "./LandingHero";
import { DuelSection } from "./DuelSection";
import { GearHallSection } from "./GearHallSection";
import { SceneGallery } from "./SceneGallery";
import { TechMarquee } from "../TechMarquee";
import { LandingFooter } from "./LandingFooter";
import type { HeroKit } from "../LandingExperience";

interface LandingPageProps {
  kits: HeroKit[];
  hallPicks: ProductDetails[];
  galleryScenes: {
    image: string;
    alt: string;
    title: string;
    copy: string;
    prompt: string;
    coord: string;
    elev: string;
  }[];
  compare: ProductDetails[];
  equipmentCount: number;
}

export function LandingPage({
  kits,
  hallPicks,
  galleryScenes,
  compare,
  equipmentCount,
}: LandingPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLenis(true);
  useLandingMotion(rootRef);

  return (
    <div ref={rootRef} className="landing-root">
      <LandingHero kits={kits} />
      {/* Dark chapter: marquee prelude, tent duel, gear hall */}
      <div className="dark-chapter">
        <TechMarquee />
        <DuelSection compare={compare} />
        <GearHallSection picks={hallPicks} equipmentCount={equipmentCount} />
      </div>
      <SceneGallery scenes={galleryScenes} />
      <LandingFooter />
    </div>
  );
}
