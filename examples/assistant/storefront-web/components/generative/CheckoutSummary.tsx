// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { formatMoney, optionValuesLabel } from "web-shared";
import type { CheckoutPayload } from "@/lib/types";
import { STORE_POLICY } from "@/lib/storePolicy";
import { ProductImage } from "../ProductTile";

const METHODS = { delivery: "配送", pickup: "门店自提", shipping: "大件货运" };

export default function CheckoutSummary({ payload }: { payload: CheckoutPayload }) {
  const { cart } = payload;
  const freeShipping = cart.subtotal > STORE_POLICY.freeShippingThreshold;
  return (
    <section data-checkout-card className="rounded-2xl border-2 border-(--accent) bg-(--card) p-4 shadow-(--shadow-sm)">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-[18px] font-medium text-(--ink)">模拟结算摘要</h3>
        <span className="rounded-full bg-(--well) px-2.5 py-0.5 text-[14px] text-(--ink-soft)">不会扣款</span>
      </div>
      {payload.note ? <p className="mt-1 text-[15px] text-(--ink-soft)">{payload.note}</p> : null}
      <div className="mt-3 space-y-3 rounded-lg bg-(--well)/60 p-3 text-[16px]">
        {cart.items.map((item) => (
          <div key={item.product_id} className="flex items-center gap-2.5">
            <ProductImage product={item} className="h-10 w-10 shrink-0 rounded-lg !text-xl" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span className="line-clamp-2 text-(--ink)">{item.title} × {item.quantity}</span>
                <span className="shrink-0 text-(--ink)">{formatMoney(item.line_total, cart.currency)}</span>
              </div>
              <p className="text-[14px] text-(--ink-soft)">{optionValuesLabel(item)}</p>
            </div>
          </div>
        ))}
        <div className="flex justify-between border-t border-(--line) pt-2 font-semibold text-(--ink)">
          <span>商品小计</span>
          <span>{formatMoney(cart.subtotal, cart.currency)}</span>
        </div>
        {payload.fulfillment_method ? (
          <div className="flex justify-between text-(--ink-soft)"><span>所选方式</span><span>{METHODS[payload.fulfillment_method]}</span></div>
        ) : null}
        {cart.currency === STORE_POLICY.currency ? <p className="text-[16px] leading-relaxed text-(--ink-soft)">
          标准配送参考：{freeShipping ? "免运费" : `${formatMoney(STORE_POLICY.standardShippingFee, cart.currency)}，小计高于 ${formatMoney(STORE_POLICY.freeShippingThreshold, cart.currency)} 时免运费`}，约 {STORE_POLICY.standardShippingEta}。
          商品小计未含其他配送费用或税费。
        </p> : <p className="text-[16px] text-(--ink-soft)">历史结算摘要，金额与币种按保存记录展示。</p>}
      </div>
      {cart.currency === STORE_POLICY.currency ? <p className="mt-2 text-[16px] text-(--ink-soft)">{STORE_POLICY.returnsLine}</p> : null}
      <p className="mt-3 rounded-lg bg-(--accent-soft) p-2.5 text-center text-[15px] text-(--ink)">
        这是模拟结算，不会创建订单、扣款或发货。
      </p>
    </section>
  );
}
