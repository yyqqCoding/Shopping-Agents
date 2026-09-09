// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

/** The cart drawer and the pieces its lines use. */

import type { ReactNode } from "react";
import { Icon } from "../icons";
import { IconButton } from "../ui";
import { useStoreFrame } from "./frame";

/**
 * Header with the count, the lines, and a footer for totals and the primary action. The vertical
 * renders its own lines and footer; quantity and checkout go through the conversation as messages.
 */
export function BagPanel({
  title,
  count,
  empty,
  isEmpty,
  footer,
  children,
  className,
}: {
  title: string;
  /** "1 item", "2 bookings"; pops when it changes. */
  count: string;
  /** Shown in place of the lines while the bag is empty: the state, then what to ask. */
  empty: ReactNode;
  isEmpty: boolean;
  footer: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { closePanel } = useStoreFrame();
  return (
    <section className={`bag-panel${className ? ` ${className}` : ""}`}>
      <div className="flex items-center gap-2 border-b border-(--line) px-[18px] py-3.5">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-(--ink)">{title}</h2>
        <span
          key={count}
          data-cart-target
          className="ac-pop rounded-full bg-(--well) px-2 py-0.5 text-[14px] font-semibold tabular-nums text-(--ink-2)"
        >
          {count}
        </span>
        <IconButton icon="x" label={`关闭${title}`} onClick={closePanel} className="ml-auto min-h-11 min-w-11" />
      </div>
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-[18px] py-3.5">
        {isEmpty ? (
          <div className="mt-16 px-4 text-center text-[16px] leading-relaxed text-(--ink-soft)">{empty}</div>
        ) : (
          children
        )}
      </div>
      <div className="border-t border-(--line) px-[18px] pb-[calc(18px+env(safe-area-inset-bottom))] pt-3.5">{footer}</div>
    </section>
  );
}

/** 商品小计 row above the primary action. */
export function TotalRow({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] text-(--ink-2)">{label}</span>
        <span className="text-[21px] font-bold tabular-nums tracking-[-0.01em] text-(--ink)">{value}</span>
      </div>
      {note ? <p className="mt-0.5 text-right text-[13px] text-(--ink-soft)">{note}</p> : null}
    </div>
  );
}

/** The hand-off under a panel's primary action or a card: sends one question. */
export function AskLink({ label, prompt }: { label: string; prompt: string }) {
  const { ask, chat } = useStoreFrame();
  return (
    <button
      type="button"
      disabled={!!chat && (!chat.ready || chat.busy)}
      onClick={() => ask(prompt)}
      className="inline-flex min-h-10 items-center gap-1.5 text-[14px] font-semibold text-(--accent-ink) transition-colors hover:text-(--accent)"
    >
      <Icon name="spark" size={13} className="text-(--accent)" />
      {label}
    </button>
  );
}

/**
 * A line's quantity control. Each press is a message to the assistant, so it waits while a reply
 * streams; `unit` names what is counted when it is not the item itself ("night", "guest").
 */
export function Stepper({
  quantity,
  unit,
  itemTitle,
  onChange,
  disabled = false,
}: {
  quantity: number;
  unit?: string;
  itemTitle: string;
  /** Called with the new quantity; 0 means remove. */
  onChange: (quantity: number) => void;
  disabled?: boolean;
}) {
  const chat = useStoreFrame().chat;
  const busy = disabled || !!chat && (chat.busy || !chat.ready);
  const units = unit ? ` ${unit}${quantity === 1 ? "" : "s"}` : "";
  return (
    <div className="flex items-center rounded-full border border-(--line-strong) bg-(--card)">
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange(quantity - 1)}
        aria-label={unit ? `减少${itemTitle}的${unit}` : `减少${itemTitle}数量`}
        className="grid h-10 w-10 place-items-center text-lg text-(--ink-soft) hover:text-(--ink) disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-6 text-center text-[15px] font-semibold tabular-nums text-(--ink)">
        {quantity}
        {units}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange(quantity + 1)}
        aria-label={unit ? `增加${itemTitle}的${unit}` : `增加${itemTitle}数量`}
        className="grid h-10 w-10 place-items-center text-lg text-(--ink-soft) hover:text-(--ink) disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

export function RemoveLink({ itemTitle, onClick }: { itemTitle: string; onClick: () => void }) {
  const chat = useStoreFrame().chat;
  const busy = !!chat && (chat.busy || !chat.ready);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      aria-label={`移除${itemTitle}`}
      className="min-h-10 px-1 text-[14px] text-(--ink-soft) underline-offset-2 hover:text-(--danger) hover:underline disabled:opacity-40"
    >
      移除
    </button>
  );
}

/** Once the assistant has staged a checkout, the primary action scrolls to that summary instead. */
export function CheckoutButton({ staged, disabled, prompt }: { staged: boolean; disabled: boolean; prompt: string }) {
  const { ask, chat, closePanel } = useStoreFrame();
  disabled = disabled || !!chat && (chat.busy || !chat.ready);
  if (staged && !disabled) {
    return (
      <button
        type="button"
        onClick={() => {
          closePanel();
          const cards = document.querySelectorAll("[data-checkout-card]");
          const card = cards[cards.length - 1];
          if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
          else ask("再次展示结算摘要。");
        }}
        className="mt-3 min-h-11 w-full rounded-(--radius) border border-(--line-strong) bg-(--card) py-2.5 text-[16px] font-semibold text-(--ink) transition hover:border-(--accent)"
      >
        查看摘要
      </button>
    );
  }
  return (
    <button type="button" onClick={() => ask(prompt)} disabled={disabled} className="btn-primary mt-3 w-full">
      查看结算摘要
    </button>
  );
}
