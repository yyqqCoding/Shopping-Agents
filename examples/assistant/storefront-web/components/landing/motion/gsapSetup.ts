"use client";

/**
 * GSAP assembly for the landing page — mirrors the rebuild's gsap.ts:
 * ScrollTrigger + SplitText registered once, defaults pinned.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };
