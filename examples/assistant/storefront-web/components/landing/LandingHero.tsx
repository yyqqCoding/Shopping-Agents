import type { HeroKit } from "../LandingExperience";
import { HeroTable } from "../LandingExperience";

/**
 * Landing hero — keeps the departure-table narrative (typewriter slip,
 * gear prints landing on the cloth, self-ticking manifest) and reframes
 * it with the rebuild's oversized editorial headline scale.
 */
export function LandingHero({ kits }: { kits: HeroKit[] }) {
  return (
    <section className="landing-hero" aria-labelledby="landing-hero-title">
      <HeroTable kits={kits}>
        <h1 id="landing-hero-title" className="landing-hero-title" data-hero="title">
          <span className="hero-title-line">
            <span>把下一程，</span>
          </span>
          <span className="hero-title-line">
            <span>摊开来看。</span>
          </span>
        </h1>
        <p className="landing-hero-sub" data-hero="sub">
          说出行程、人数和预算，装备会一件件落到布上，清单同时写好。
        </p>
      </HeroTable>
    </section>
  );
}
