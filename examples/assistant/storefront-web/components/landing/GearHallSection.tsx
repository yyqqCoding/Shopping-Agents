import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { Arrow } from "../SiteChrome";
import { GearHallGrid } from "../GearHallGrid";

/**
 * Gear Hall of Fame — chamfered cards on a scroll-settling column grid,
 * ported from the rebuild's helmet grid (i * 5rem column offsets).
 */
export function GearHallSection({
  picks,
  equipmentCount,
}: {
  picks: ProductDetails[];
  equipmentCount: number;
}) {
  return (
    <section className="hall-section" aria-label="装备殿堂">
      <header className="hall-head">
        <h2 className="hall-title" data-oval-title>
          GEAR HALL
          <br />
          <em>装备殿堂</em>
        </h2>
        <div className="hall-head-side">
          <p>每一件都经过山脊与营地的双重验证。悬停查看细节，点击进入完整规格。</p>
          <Link href="/equipment" className="hall-more">
            <span>探索全部 {equipmentCount} 款精选装备</span>
            <Arrow />
          </Link>
        </div>
      </header>
      <div className="hall-grid-w" data-hall-grid>
        <GearHallGrid products={picks} />
      </div>
    </section>
  );
}
