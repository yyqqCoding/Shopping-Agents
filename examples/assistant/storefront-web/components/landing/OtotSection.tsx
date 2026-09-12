import Link from "next/link";
import Image from "next/image";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { Arrow } from "../SiteChrome";
import { ProductImage } from "../ProductTile";

/**
 * ON RIDGE / IN CAMP — the rebuild's otot section ported to the catalog:
 * two full-height scene photographs converge from opposite edges on scroll
 * while the paired text columns settle inward. Tents appear as compact
 * spec chips pinned over each scene, not as page-filling prints.
 */
export function OtotSection({ compare }: { compare: ProductDetails[] }) {
  const ridge = compare.find((p) => p.product_id === "OD-1001") ?? compare[0];
  const camp = compare.find((p) => p.product_id === "OD-1002") ?? compare[1];

  return (
    <>
      <section className="otot-stage" data-otot-stage aria-label="轻装与宽居双态对比">
        {/* Converging full-height scene photographs */}
        <div className="otot-bg" aria-hidden="true">
          <div className="otot-img-w" data-otot-img="1">
            <Image src="/images/hiking.webp" alt="" fill sizes="50vw" />
          </div>
          <div className="otot-img-w" data-otot-img="2">
            <Image src="/images/camping.webp" alt="" fill sizes="50vw" />
          </div>
        </div>

        {/* Text columns settling inward */}
        <div className="otot-grid">
          <div className="otot-col" data-otot-col="1">
            <span className="otot-kicker">ROUTE 01 · 31°14&apos;N</span>
            <h2 className="otot-word" data-oval-title>
              ON
              <br />
              RIDGE
            </h2>
            <p className="otot-copy">
              山脊轻装。背负 <strong>1.85 kg</strong> 疾行于碎石与松针之间，把每一克都留给路程。
            </p>
            <div className="otot-chip">
              <div className="otot-chip-photo">
                <ProductImage product={ridge} sizes="120px" />
              </div>
              <div className="otot-chip-meta">
                <span className="chip-name">{ridge.title}</span>
                <span className="chip-spec">1,850 g · 宽 125 cm · ¥{ridge.price.toLocaleString("zh-CN")}</span>
              </div>
              <Link
                className="otot-chip-go"
                href={assistantLink("想走轻装徒步路线，请介绍双人三季徒步帐篷 OD-1001 的重量与适用场景。")}
                aria-label="询问超轻帐篷"
              >
                <Arrow />
              </Link>
            </div>
          </div>

          <div className="otot-col is-2" data-otot-col="2">
            <span className="otot-kicker">ROUTE 02 · 30°18&apos;N</span>
            <h2 className="otot-word" data-oval-title>
              IN
              <br />
              CAMP
            </h2>
            <p className="otot-copy">
              营地宽居。<strong>+35% 舒展空间</strong>，160 cm 加宽内帐，把周末安放在湖畔林间。
            </p>
            <div className="otot-chip">
              <div className="otot-chip-photo">
                <ProductImage product={camp} sizes="120px" />
              </div>
              <div className="otot-chip-meta">
                <span className="chip-name">{camp.title}</span>
                <span className="chip-spec">3,200 g · 宽 160 cm · ¥{camp.price.toLocaleString("zh-CN")}</span>
              </div>
              <Link
                className="otot-chip-go"
                href={assistantLink("计划周末自驾露营，请介绍双人宽居营地帐篷 OD-1002 的空间与舒适度。")}
                aria-label="询问宽居帐篷"
              >
                <Arrow />
              </Link>
            </div>
          </div>
        </div>

        <div className="otot-vs" aria-hidden="true">
          <span>VS</span>
        </div>
      </section>

      {/* Wide closing parallax image */}
      <section className="otot-bottom" data-otot-bottom aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/lightweight.webp" alt="" loading="lazy" />
      </section>
    </>
  );
}
