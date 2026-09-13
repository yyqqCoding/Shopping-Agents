import Link from "next/link";
import type { ProductDetails } from "@/lib/types";
import { assistantLink } from "@/lib/navigation";
import { Arrow } from "../SiteChrome";
import { ProductImage } from "../ProductTile";

/**
 * Duel Stage — dark chapter opener.
 *
 * The two flagship tents stand plateless on one horizon line inside a
 * pine-ink showroom; their white studio prints read as backlit display
 * windows on the dark ground. Widths follow the true inner-width ratio
 * (125cm : 160cm), and three head-to-head axes glow to real value
 * proportions at the center of the viewport.
 */

const AXES: {
  label: string;
  left: { text: string; p: number };
  right: { text: string; p: number };
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
      {/* Oversized outline watermark pair behind the tents */}
      <div className="duel-watermark" aria-hidden="true">
        <span className="duel-wm is-left" data-duel-wm="left">
          ON RIDGE
        </span>
        <span className="duel-wm is-right" data-duel-wm="right">
          IN CAMP
        </span>
      </div>

      <div className="duel-content">
        <header className="duel-head">
          <span className="duel-kicker">DUAL FIELD STUDY // WEIGHT VS VOLUME</span>
          <h2 className="duel-title" data-oval-title>
            轻一点，
            <br />
            还是宽敞一点？
          </h2>
          <p className="duel-sub">
            两顶旗舰帐篷摊开在同一地平线上。空间与重量的取舍，一眼可见。
          </p>
        </header>

        {/* Plateless tents on one horizon, true width ratio 125 : 160 */}
        <div className="duel-tents">
          <figure className="duel-tent is-left" data-duel-tent="left">
            <Link
              href={assistantLink(
                "想走轻装徒步路线，请介绍双人三季徒步帐篷 OD-1001 的重量与适用场景。",
              )}
              className="duel-stand"
              style={{ "--stand-w": "24rem" } as React.CSSProperties}
            >
              <span className="duel-stand-tag">ON RIDGE · 山脊轻装</span>
              <span className="duel-stand-img">
                <ProductImage product={ridge} sizes="(max-width: 900px) 72vw, 384px" />
              </span>
              <span className="duel-stand-name">{ridge.title}</span>
            </Link>
            <figcaption className="duel-measure">
              <span className="measure-line" />
              <span className="measure-text">125 cm · 1,850 g</span>
              <span className="measure-line" />
            </figcaption>
            <span className="duel-contact-shadow" aria-hidden="true" />
          </figure>

          <figure className="duel-tent is-right" data-duel-tent="right">
            <Link
              href={assistantLink(
                "计划周末自驾露营，请介绍双人宽居营地帐篷 OD-1002 的空间与舒适度。",
              )}
              className="duel-stand"
              style={{ "--stand-w": "30.7rem" } as React.CSSProperties}
            >
              <span className="duel-stand-tag green">IN CAMP · 营地宽居</span>
              <span className="duel-stand-img">
                <ProductImage product={camp} sizes="(max-width: 900px) 84vw, 490px" />
              </span>
              <span className="duel-stand-name">{camp.title}</span>
            </Link>
            <figcaption className="duel-measure">
              <span className="measure-line" />
              <span className="measure-text">160 cm · 3,200 g</span>
              <span className="measure-line" />
            </figcaption>
            <span className="duel-contact-shadow" aria-hidden="true" />
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
