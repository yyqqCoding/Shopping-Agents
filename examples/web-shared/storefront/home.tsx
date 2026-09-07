// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

/** The blocks a storefront's home is built from, and its conversation starters. */

import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons";
import { useStoreFrame } from "./frame";

/** The home's opening: the vertical's headline, then one brief line of what is going on. */
export function Greeting({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="ac-reveal pt-2">
      {eyebrow ? <div className="mb-1.5 text-[12px] font-semibold tracking-[0.02em] text-(--ink-soft)">{eyebrow}</div> : null}
      {title}
      {children ? <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-(--ink-2)">{children}</p> : null}
    </div>
  );
}

export interface Starter {
  icon: IconName;
  prompt: string;
}

/** The ways to begin; each sends its prompt as the first message. */
export function Starters({ items }: { items: Starter[] }) {
  const { ask, chat } = useStoreFrame();
  const disabled = !chat || chat.busy || !chat.ready;
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {items.map((item, index) => (
        <button
          key={item.prompt}
          type="button"
          onClick={() => ask(item.prompt)}
          disabled={disabled}
          className="ac-reveal group flex items-center gap-3 rounded-(--radius) border border-(--line) bg-(--card) px-3.5 py-3 text-left shadow-(--shadow-sm) transition hover:border-(--accent) disabled:opacity-50"
          style={{ animationDelay: `${60 + index * 50}ms` }}
        >
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-(--accent-soft) text-(--accent)">
            <Icon name={item.icon} size={16} />
          </span>
          <span className="min-w-0 flex-1 text-[14px] leading-snug text-(--ink)">{item.prompt}</span>
          <Icon name="arrow-right" size={15} className="shrink-0 text-(--ink-faint) transition-colors group-hover:text-(--accent)" />
        </button>
      ))}
    </div>
  );
}

/** A titled block on the home that is not a card (a product strip). */
export function HomeSection({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="ac-reveal" style={{ animationDelay: "160ms" }}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-(--ink)">{title}</h2>
        {subtitle ? <span className="text-[12.5px] text-(--ink-soft)">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** "All orders" style link for a card header. */
export function MoreLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-(--accent-ink) transition-colors hover:text-(--accent)"
    >
      {label}
      <Icon name="arrow-right" size={13} />
    </button>
  );
}
