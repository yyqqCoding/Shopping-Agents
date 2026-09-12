import Link from "next/link";
import Image from "next/image";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { Arrow } from "../SiteChrome";
import { ProductImage } from "../ProductTile";

/**
 * Duel Stage — the tent comparison as a proportion duel.
 *
 * Two scene photographs meet on a 10° diagonal seam; hovering either side
 * slides the seam and cedes the stage. The tents render as plates whose
 * widths follow their true inner widths (125cm : 160cm), and three
 * head-to-head axes grow to real value ratios on entry.
 */

const AXES: {
  label: string;
  left: { text: string; p: number };
  right: { text: string; p: number };
  note?: string;
}[] = [
  {
    label: "打包重量",
    left: { text: "1,850 g", p: 1850 / 3200 },
    right: { text: "3,200 g", p: 1 },
  },
  {
    label: "内帐宽度",
    left: { text: "125 cm", p: 125 / 160 },
    right: { text: "160 cm", p: 1 },
  },
  {
    label: "入手价格",
    left: { text: "¥699", p: 1 },
    right: { text: "¥499", p: 499 / 699 },
  },
];

export function DuelSection({ compare }: { compare: ProductDetails[] }) {
  const ridge = compare.find((p) => p.product_id === "OD-1001") ?? compare[0];
  const camp = compare.find((p) => p.product_id === "OD-1002") ?? compare[1];

  return (
    <section className="duel-stage" data-duel-stage aria-label="轻一点还是宽敞一点">
      {/* Diagonal split scenes */}
      <div className="duel-bg" aria-hidden="true">
        <div className="duel-half is-left" data-duel-half="left">
          <Image src="/images/hiking.webp" alt="" fill sizes="60vw" />
        </div>
        <div className="duel-half is-right" data-duel-half="right">
          <Image src="/images/camping.webp" alt="" fill sizes="60vw" />
        </div>
        <div className="duel-seam" aria-hidden="true">
          <span className="seam-tick is-1" />
          <span className="seam-tick is-2" />
          <span className="seam-tick is-3" />
        </div>
      </div>

      <div className="duel-content">
        <header className="duel-head">
          <span className="duel-kicker">DUAL FIELD STUDY // WEIGHT VS VOLUME</span>
          <h2 className="duel-title" data-oval-title>
            轻一点，
            <br />
            还是宽敞一点？
          </h2>
        </header>

        {/* Proportion-true tent plates */}
        <div className="duel-tents">
          <figure className="duel-tent is-left" data-duel-tent="left">
            <Link
              href={assistantLink("想走轻装徒步路线，请介绍双人三季徒步帐篷 OD-1001 的重量与适用场景。")}
              className="duel-plate"
              style={{ "--plate-w": "26rem" } as React.CSSProperties}
            >
              <span className="duel-plate-tag">ON RIDGE · 山脊轻装</span>
              <ProductImage product={ridge} sizes="(max-width: 900px) 70vw, 420px" />
              <span className="duel-plate-name">{ridge.title}</span>
            </Link>
            <figcaption className="duel-measure">
              <span className="measure-line" />
              <span className="measure-text">宽 125 cm</span>
              <span className="measure-line" />
            </figcaption>
          </figure>

          <figure className="duel-tent is-right" data-duel-tent="right">
            <Link
              href={assistantLink("计划周末自驾露营，请介绍双人宽居营地帐篷 OD-1002 的空间与舒适度。")}
              className="duel-plate"
              style={{ "--plate-w": "33.3rem" } as React.CSSProperties}
            >
              <span className="duel-plate-tag green">IN CAMP · 营地宽居</span>
              <ProductImage product={camp} sizes="(max-width: 900px) 80vw, 540px" />
              <span className="duel-plate-name">{camp.title}</span>
            </Link>
            <figcaption className="duel-measure">
              <span className="measure-line" />
              <span className="measure-text">宽 160 cm</span>
              <span className="measure-line" />
            </figcaption>
          </figure>
          <div className="duel-ground" aria-hidden="true" />
        </div>

        {/* Head-to-head ratio axes */}
        <div className="duel-axes" data-duel-axes>
          {AXES.map((axis) => (
            <div className="duel-axis" key={axis.label}>
              <span className="axis-val is-left">{axis.left.text}</span>
              <div className="axis-track">
                <span
                  className="axis-bar is-left"
                  style={{ "--p": axis.left.p } as React.CSSProperties}
                />
                <span className="axis-label">{axis.label}</span>
                <span
                  className="axis-bar is-right"
                  style={{ "--p": axis.right.p } as React.CSSProperties}
                />
              </div>
              <span className="axis-val is-right">{axis.right.text}</span>
            </div>
          ))}
          <p className="duel-axes-note">重量与价格，越短越轻松；宽度，越长越从容。</p>
        </div>

        <footer className="duel-foot">
          <Link
            className="duel-cta"
            href={assistantLink(
              "请深入对比双人三季徒步帐篷 OD-1001 和双人宽居营地帐篷 OD-1002，从重量、防风指数与睡眠舒适度给出选购建议。",
            )}
          >
            <span>让助手为你剖析取舍</span>
            <Arrow />
          </Link>
        </footer>
      </div>
    </section>
  );
}
