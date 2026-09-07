// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import type { GuidePayload } from "@/lib/types";
import ProductTile from "../ProductTile";

export default function GuideCard({ payload }: { payload: GuidePayload }) {
  return (
    <section className="guide-card rounded-xl border border-(--line) bg-(--card) p-5">
      <h3 className="font-display text-[18px] font-medium tracking-[-0.01em] text-(--ink)">
        {payload.title}
      </h3>
      <div className="mt-5 space-y-5">
        {(payload.sections ?? []).map((section, index) => (
          <div key={index}>
            <h4 className="text-[15px] font-semibold text-(--accent-ink)">
              {section.heading}
            </h4>
            <p className="mt-2 text-[16px] leading-relaxed text-(--ink-2)">
              {section.body}
            </p>
          </div>
        ))}
      </div>
      {payload.related_products?.length ? (
        <div className="panel-scroll mt-3 flex gap-3 overflow-x-auto border-t border-(--line) pt-3">
          {payload.related_products.map((product) => (
            <ProductTile key={product.product_id} product={product} compact />
          ))}
        </div>
      ) : null}
      {payload.sources?.length ? (
        <p className="mt-3 break-all text-[13px] text-(--ink-soft)/80">
          参考来源： {payload.sources.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
