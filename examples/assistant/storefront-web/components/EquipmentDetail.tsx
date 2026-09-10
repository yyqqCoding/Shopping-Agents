"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { optionValuesLabel } from "web-shared";
import type { Product, ProductDetails } from "@/lib/types";
import { fetchProduct } from "@/lib/api";
import { assistantLink } from "@/lib/navigation";
import { ProductImage } from "./ProductTile";
import { Arrow } from "./SiteChrome";

export default function EquipmentDetail({
  product,
}: {
  product: ProductDetails;
}) {
  const [full, setFull] = useState(product);
  const [selected, setSelected] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchProduct(product.product_id)
      .then((result) => {
        if (live && result) {
          setFull(result);
          setSynced(true);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [product.product_id]);
  const variant = full.variants?.find((item) => item.product_id === selected);
  const display: Product = variant ? { ...full, ...variant } : full;
  const specs = Object.entries(full.specs ?? {});
  const priorityKeys = [
    "重量", "容量", "人数", "舒适温度", "R 值", "最高亮度",
    "防水", "鞋帮", "标称功率", "标称承重",
  ];
  const highlightKeys = [
    ...new Set([
      ...priorityKeys.filter((key) => full.specs?.[key]),
      ...specs
        .map(([key]) => key)
        .filter((key) => key !== "适合场景" && key !== "选购限制"),
    ]),
  ].slice(0, 3);
  const otherSpecs = specs.filter(
    ([key]) => !highlightKeys.includes(key) && key !== "选购限制",
  );
  const prompt = `帮我看看${display.title}（${display.product_id}），结合我的出行需求判断是否合适，并确认规格与库存。`;
  return (
    <>
      <div className="detail-main" data-reveal>
        <div
          className="detail-photo"
          style={{ viewTransitionName: `gear-${product.product_id}` }}
        >
          <ProductImage
            product={display}
            className="h-full w-full"
            priority
            sizes="(max-width: 760px) 100vw, 55vw"
          />
        </div>
        <div className="detail-copy">
          <h1>{full.title}</h1>
          <p className="detail-category">{full.attributes?.category_label}</p>
          <p className="detail-description">{full.short_description}</p>
          <div className="detail-price">
            ¥{display.price.toLocaleString("zh-CN")}
            <span>{full.options && !selected ? "起" : "人民币"}</span>
          </div>
          <dl className="detail-highlights">
            {highlightKeys.map((key) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{full.specs![key]}</dd>
              </div>
            ))}
          </dl>
          {!!full.variants?.length && (
            <fieldset className="detail-options">
              <legend>选择规格</legend>
              <div>
                {full.variants.map((item) => (
                  <button
                    type="button"
                    key={item.product_id}
                    disabled={item.in_stock === false}
                    aria-pressed={selected === item.product_id}
                    onClick={() => setSelected(item.product_id)}
                  >
                    {Object.values(item.option_values ?? {}).join(" / ") ||
                      item.title}
                    {item.in_stock === false ? " · 缺货" : ""}
                  </button>
                ))}
              </div>
              {variant ? (
                <p className="detail-selection" role="status">
                  已选：{optionValuesLabel(variant) || variant.title}
                </p>
              ) : null}
            </fieldset>
          )}
          <Link href={assistantLink(prompt)} className="field-button">
            让助手帮我选 <Arrow diagonal />
          </Link>
          <p className="detail-stock">
            {synced
              ? display.in_stock === false
                ? "当前暂时缺货，可向助手了解替代装备。"
                : "当前可选 · 具体数量由助手确认"
              : "目录展示 · 库存以助手确认为准"}
          </p>
        </div>
      </div>
      <section className="detail-information" data-reveal>
        <div>
          <h2>把细节看清楚。</h2>
          <p>场景决定选择，参数帮助判断。</p>
          {full.specs?.["选购限制"] && (
            <div className="detail-caution">
              <h3>选择前，留意这一点</h3>
              <p>{full.specs["选购限制"]}</p>
            </div>
          )}
        </div>
        <dl className="specification-list">
          {otherSpecs.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
