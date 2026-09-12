"use client";

import { useRef, useState, useEffect } from "react";
import type { Product } from "@/lib/types";
import EquipmentCard from "./EquipmentCard";

interface FeaturedSpotlightGridProps {
  products: Product[];
}

export function FeaturedSpotlightGrid({ products }: FeaturedSpotlightGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    gridRef.current.style.setProperty("--spotlight-x", `${x}px`);
    gridRef.current.style.setProperty("--spotlight-y", `${y}px`);
  };

  const handleMouseLeave = () => {
    if (!gridRef.current) return;
    gridRef.current.style.setProperty("--spotlight-x", `-999px`);
    gridRef.current.style.setProperty("--spotlight-y", `-999px`);
  };

  return (
    <div
      ref={gridRef}
      className="featured-grid luxury-featured-grid spotlight-grid"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Dynamic Cursor Spotlight Beam */}
      <div className="grid-spotlight-beam" aria-hidden="true" />

      {products.map((product, index) => (
        <div key={product.product_id} className="spotlight-card-wrap">
          <EquipmentCard product={product} index={index} />
        </div>
      ))}
    </div>
  );
}
