import type { Product } from "@/lib/types";
import Link from "next/link";
import { ProductImage } from "./ProductTile";

/**
 * Gear Hall of Fame — chamfered SVG frame cards in the spirit of the
 * Lando "Helmets Hall of Fame" grid: a cut-corner outline that ignites
 * in safety orange on hover while the print lifts inside the frame.
 */

const FRAME_PATH =
  "M10 1h380a9 9 0 0 1 9 9v372a9 9 0 0 1-9 9H262a24 24 0 0 0-18.8 9.1l-16.5 20.7A22 22 0 0 1 209 429H10a9 9 0 0 1-9-9V10a9 9 0 0 1 9-9Z";

function ChamferFrame() {
  return (
    <>
      <svg
        className="gear-frame is-base"
        viewBox="0 0 400 430"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <path
          d={FRAME_PATH}
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <svg
        className="gear-frame is-ignite"
        viewBox="0 0 400 430"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <path
          d={FRAME_PATH}
          stroke="var(--marker)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );
}

export function GearHallGrid({ products }: { products: Product[] }) {
  return (
    <div className="gear-hall-grid" data-reveal>
      {products.map((product, index) => (
        <Link
          key={product.product_id}
          href={`/equipment/${product.product_id}`}
          className="gear-hall-card"
          style={{ "--i": index } as React.CSSProperties}
          aria-label={`查看${product.title}`}
        >
          <div className="gear-hall-frame-w">
            <ChamferFrame />
            <div className="gear-hall-photo">
              <ProductImage
                product={product}
                sizes="(max-width: 820px) 44vw, 340px"
              />
            </div>
            <div className="gear-hall-serial" aria-hidden="true">
              <span className="serial-tag">{product.product_id}</span>
              <span className="serial-index">{String(index + 1).padStart(2, "0")}</span>
            </div>
          </div>
          <div className="gear-hall-meta">
            <h3>{product.title}</h3>
            <span className="gear-hall-price">
              ¥{product.price.toLocaleString("zh-CN")}
              {product.options && <small> 起</small>}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
