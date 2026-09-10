import type { Product } from "@/lib/types";
import Link from "next/link";
import { ProductImage } from "./ProductTile";

const TILTS = [-1.6, 1.1, -0.7, 1.8, -1.2, 0.9, -1.9, 1.4];

export default function EquipmentCard({
  product,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  return (
    <Link
      href={`/equipment/${product.product_id}`}
      className="equipment-card"
      aria-label={`查看${product.title}`}
    >
      <span
        className="print equipment-card-photo"
        data-land
        style={
          {
            viewTransitionName: `gear-${product.product_id}`,
            "--tilt": `${TILTS[index % TILTS.length]}deg`,
            "--i": index % 4,
          } as React.CSSProperties
        }
      >
        <ProductImage product={product} className="h-full w-full" />
        {product.in_stock === false && (
          <span className="equipment-stock">暂时缺货</span>
        )}
      </span>
      <h3>{product.title}</h3>
      <p>
        {[
          product.attributes?.category_label,
          product.attributes?.highlight_1,
          product.attributes?.highlight_2,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <span className="equipment-card-price">
        ¥{product.price.toLocaleString("zh-CN")}
        {product.options && <small>起</small>}
      </span>
    </Link>
  );
}
