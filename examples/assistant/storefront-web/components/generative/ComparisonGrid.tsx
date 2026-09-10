// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { formatMoney, priceLabel } from "web-shared";
import type { ComparisonPayload } from "@/lib/types";
import { ProductImage, ProductTitle } from "../ProductTile";

const SHARED_ATTRIBUTES = [
  { key: "weight_g", label: "重量", unit: "g" },
  { key: "material", label: "材质" },
  { key: "capacity", label: "容量" },
  { key: "capacity_people", label: "人数" },
];

function Terms({ items }: { items?: string[] }) {
  return items?.length ? (
    <ul className="comparison-terms">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  ) : (
    <span className="comparison-missing">未提供</span>
  );
}

export default function ComparisonGrid({
  payload,
  partial,
}: {
  payload: ComparisonPayload;
  partial?: boolean;
}) {
  const entries = payload.entries ?? [];
  const currencies = new Set(
    entries.map((entry) => entry.product.currency ?? "USD"),
  );
  const currency = entries[0]?.product.currency;
  const delta = currencies.size === 1 ? payload.price_delta : undefined;
  const recommended = entries.find(
    (entry) => entry.product_id === payload.recommended_product_id,
  );
  // Only named attributes present on every product become comparison rows.
  // Positions in independent prose lists do not imply a shared dimension.
  const attributes =
    entries.length > 1
      ? SHARED_ATTRIBUTES.filter(({ key }) =>
          entries.every(({ product }) => product.attributes?.[key]),
        ).slice(0, 3)
      : [];
  const hasScenario = entries.some((entry) => entry.best_for);
  const hasPros = entries.some((entry) => entry.pros?.length);
  const hasCons = entries.some((entry) => entry.cons?.length);
  const choiceClass = (id: string) =>
    id === payload.recommended_product_id ? "comparison-choice" : undefined;

  return (
    <section className="comparison-grid">
      <header className="comparison-heading">
        <h3 className="recommendation-heading">
          {payload.title ?? "把差异看清楚"}
        </h3>
        {delta ? (
          <span className="comparison-delta">
            价差 {formatMoney(delta.amount, currency)}
          </span>
        ) : null}
      </header>
      {recommended ? (
        <div className="comparison-verdict">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m5 12 4 4L19 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            优先考虑 <strong>{recommended.product.title}</strong>
          </span>
        </div>
      ) : null}
      {entries.length ? (
        <div
          className="comparison-scroll panel-scroll"
          role="region"
          aria-label="商品参数与取舍对比"
          tabIndex={0}
        >
          <table
            className="comparison-table"
            style={{ minWidth: `${Math.max(540, entries.length * 240 + 100)}px` }}
          >
            <caption className="sr-only">{payload.title ?? "装备对比"}</caption>
            <colgroup>
              <col className="comparison-label-column" />
              {entries.map((entry) => (
                <col key={entry.product_id} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="comparison-corner">
                  选择依据
                </th>
                {entries.map((entry) => (
                  <th
                    scope="col"
                    key={entry.product_id}
                    className={choiceClass(entry.product_id)}
                  >
                    <div className="comparison-product">
                      <ProductImage
                        product={entry.product}
                        className="comparison-photo"
                        sizes="180px"
                      />
                      <div>
                        <ProductTitle
                          title={entry.product.title}
                          className="comparison-product-title"
                        />
                        <span className="comparison-price">
                          {priceLabel(entry.product)}
                        </span>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hasScenario ? (
                <tr>
                  <th scope="row">适合场景</th>
                  {entries.map((entry) => (
                    <td key={entry.product_id} className={choiceClass(entry.product_id)}>
                      {entry.best_for || "未提供"}
                    </td>
                  ))}
                </tr>
              ) : null}
              {attributes.map(({ key, label, unit }) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  {entries.map((entry) => {
                    const value = entry.product.attributes![key];
                    const display =
                      unit && Number.isFinite(Number(value))
                        ? `${Number(value).toLocaleString("zh-CN")} ${unit}`
                        : value;
                    return (
                      <td key={entry.product_id} className={choiceClass(entry.product_id)}>
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {hasPros ? (
                <tr>
                  <th scope="row">主要优势</th>
                  {entries.map((entry) => (
                    <td key={entry.product_id} className={choiceClass(entry.product_id)}>
                      <Terms items={entry.pros} />
                    </td>
                  ))}
                </tr>
              ) : null}
              {hasCons ? (
                <tr className="comparison-tradeoffs">
                  <th scope="row">需要留意</th>
                  {entries.map((entry) => (
                    <td key={entry.product_id} className={choiceClass(entry.product_id)}>
                      <Terms items={entry.cons} />
                    </td>
                  ))}
                </tr>
              ) : null}
              {entries.some(({ product }) => product.product_id.startsWith("OD-")) ? (
                <tr className="comparison-actions">
                  <th scope="row">
                    <span className="sr-only">商品详情</span>
                  </th>
                  {entries.map(({ product, product_id }) => (
                    <td key={product_id} className={choiceClass(product_id)}>
                      {product.product_id.startsWith("OD-") ? (
                        <Link
                          className="comparison-detail-link"
                          href={`/equipment/${product.variant_of ?? product.product_id}`}
                        >
                          查看装备详情
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M5 15 15 5M5 5h10v10"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </Link>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {partial ? (
        <p className="comparison-loading" role="status">正在整理比较信息…</p>
      ) : null}
      {payload.dimensions?.length ? (
        <p className="comparison-dimensions">
          本次关注：{payload.dimensions.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
