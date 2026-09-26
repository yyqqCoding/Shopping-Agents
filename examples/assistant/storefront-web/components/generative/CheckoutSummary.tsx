// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useState } from "react";
import { formatMoney, optionValuesLabel } from "web-shared";
import { submitOrder } from "@/lib/api";
import type { CartPayload, CheckoutPayload, PlacedOrder } from "@/lib/types";
import { STORE_POLICY } from "@/lib/storePolicy";
import { ProductImage } from "../ProductTile";

const METHODS = { delivery: "配送", pickup: "门店自提", shipping: "大件货运" };

type Submission =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "placed"; order: PlacedOrder }
  | { state: "refused"; message: string };

export default function CheckoutSummary({
  payload,
  onSubmitted,
}: {
  payload: CheckoutPayload;
  /** The emptied cart, once the order is placed. */
  onSubmitted?: (cart: CartPayload) => void;
}) {
  const { cart } = payload;
  const [submission, setSubmission] = useState<Submission>({ state: "idle" });
  const current = cart.currency === STORE_POLICY.currency;
  const freeShipping = cart.subtotal > STORE_POLICY.freeShippingThreshold;
  const blocked = cart.items.some((item) => item.unavailable_reason);

  async function submit() {
    setSubmission({ state: "submitting" });
    try {
      const result = await submitOrder(
        cart.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      );
      setSubmission({ state: "placed", order: result.order });
      onSubmitted?.(result.cart);
    } catch (error) {
      setSubmission({
        state: "refused",
        message: error instanceof Error ? error.message : "提交失败，请稍后重试。",
      });
    }
  }

  return (
    <section
      data-checkout-card
      className="checkout-summary rounded-xl border border-(--line-strong) bg-(--card) p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-[18px] font-medium text-(--ink)">
          结算摘要
        </h3>
        <span className="rounded-full bg-(--well) px-2.5 py-0.5 text-[14px] text-(--ink-soft)">
          不会扣款
        </span>
      </div>
      {payload.note ? (
        <p className="mt-1 text-[15px] text-(--ink-soft)">{payload.note}</p>
      ) : null}
      <div className="mt-5 space-y-4 border-y border-(--line) py-5 text-[16px]">
        {cart.items.map((item) => (
          <div key={item.product_id} className="flex items-center gap-2.5">
            <ProductImage
              product={item}
              className="h-16 w-16 shrink-0 rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span className="line-clamp-2 text-(--ink)">
                  {item.title} × {item.quantity}
                </span>
                <span className="shrink-0 text-(--ink)">
                  {formatMoney(item.line_total, cart.currency)}
                </span>
              </div>
              <p className="text-[14px] text-(--ink-soft)">
                {optionValuesLabel(item)}
              </p>
            </div>
          </div>
        ))}
        <div className="flex justify-between border-t border-(--line) pt-2 font-semibold text-(--ink)">
          <span>商品小计</span>
          <span>{formatMoney(cart.subtotal, cart.currency)}</span>
        </div>
        {payload.fulfillment_method ? (
          <div className="flex justify-between text-(--ink-soft)">
            <span>所选方式</span>
            <span>{METHODS[payload.fulfillment_method]}</span>
          </div>
        ) : null}
        {current ? (
          <p className="text-[16px] leading-relaxed text-(--ink-soft)">
            标准配送参考：
            {freeShipping
              ? "免运费"
              : `${formatMoney(STORE_POLICY.standardShippingFee, cart.currency)}，小计高于 ${formatMoney(STORE_POLICY.freeShippingThreshold, cart.currency)} 时免运费`}
            ，约 {STORE_POLICY.standardShippingEta}。
            商品小计未含其他配送费用或税费。
          </p>
        ) : (
          <p className="text-[16px] text-(--ink-soft)">
            历史结算摘要，金额与币种按保存记录展示。
          </p>
        )}
      </div>
      {current ? (
        <p className="mt-2 text-[16px] text-(--ink-soft)">
          {STORE_POLICY.returnsLine}
        </p>
      ) : null}
      {current && submission.state === "placed" ? (
        <p role="status" className="mt-3 rounded-lg bg-(--accent-soft) p-2.5 text-center text-[15px] text-(--ink)">
          已提交订单 {submission.order.order_id}，库存已扣减。
        </p>
      ) : current ? (
        <>
          <button
            type="button"
            className="btn-primary mt-3 w-full"
            disabled={blocked || submission.state === "submitting"}
            onClick={() => void submit()}
          >
            {submission.state === "submitting" ? "正在提交…" : "提交订单"}
          </button>
          {submission.state === "refused" ? (
            <p role="alert" className="mt-2 text-center text-[15px] text-(--warn)">
              {submission.message}
            </p>
          ) : null}
          <p className="mt-2 text-center text-[14px] text-(--ink-soft)">
            提交后创建订单并扣减库存；不会扣款或发货。
          </p>
        </>
      ) : null}
    </section>
  );
}
