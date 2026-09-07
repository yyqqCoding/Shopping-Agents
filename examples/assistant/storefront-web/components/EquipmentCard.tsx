import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductTile";
import { Arrow } from "./SiteChrome";

export default function EquipmentCard({ product }: { product: Product }) {
  return (
    <a href={`/equipment/${product.product_id}`} className="equipment-card">
      <div
        className="equipment-card-photo"
        style={{ viewTransitionName: `gear-${product.product_id}` }}
      >
        <ProductImage product={product} className="h-full w-full" />
        <span className="equipment-card-open">
          <Arrow diagonal />
        </span>
        {product.in_stock === false && (
          <span className="equipment-stock">暂时缺货</span>
        )}
      </div>
      <div className="equipment-card-category">
        {product.attributes?.category_label}
      </div>
      <h3>{product.title}</h3>
      <p>
        {product.attributes?.highlight_1}
        {product.attributes?.highlight_2
          ? ` / ${product.attributes.highlight_2}`
          : ""}
      </p>
      <div className="equipment-card-price">
        <span>¥{product.price.toLocaleString("zh-CN")}</span>
        {product.options && <small>起</small>}
        <span className="equipment-card-more">
          查看装备 <Arrow />
        </span>
      </div>
    </a>
  );
}
