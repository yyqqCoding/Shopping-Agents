// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export interface Prefill {
  text: string;
  /** Changes on every request so the same text can be offered twice. */
  nonce: number;
}

const VARIANTS = {
  /** The storefront's composer under the page: one roomy field with the send arrow inside it. */
  dock: {
    form: "items-end gap-3 rounded-[19px] border border-(--line-strong) bg-(--card) py-2.5 pl-5 pr-2.5 shadow-(--shadow) transition-colors focus-within:border-(--accent)",
    input: "bg-transparent py-2 text-[16px] sm:text-[17px] leading-[1.65]",
    button: "h-11 w-11 rounded-[13px]",
  },
  /** The portal rail: the same field, compact. */
  field: {
    form: "items-center gap-1.5 rounded-[14px] border border-(--line-strong) bg-(--card) py-[5px] pl-3.5 pr-[5px] shadow-(--shadow-sm) transition-colors focus-within:border-(--accent)",
    // 16px below lg so touch browsers do not zoom on focus.
    input: "bg-transparent py-1.5 text-[16px] lg:text-[14.5px]",
    button: "h-8 w-8 rounded-[10px]",
  },
};

/** A prefill only fills the draft. */
export function Composer({
  send,
  ready,
  busy,
  label,
  placeholder,
  prefill,
  variant = "dock",
  className = "",
}: {
  send: (text: string) => void;
  ready: boolean;
  busy: boolean;
  label: string;
  placeholder: string;
  prefill?: Prefill | null;
  variant?: keyof typeof VARIANTS;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "auto";
    const height = box.scrollHeight;
    box.style.height = `${Math.min(height, 160)}px`;
    box.style.overflowY = height > 160 ? "auto" : "hidden";
  }, []);

  useEffect(() => { resize(); }, [draft, placeholder, busy, variant, resize]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resize();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [resize]);

  useEffect(() => {
    if (!prefill) return;
    setDraft(prefill.text);
    boxRef.current?.focus();
  }, [prefill]);

  const submit = () => {
    if (!draft.trim() || busy || !ready) return;
    send(draft);
    setDraft("");
  };

  return (
    <form
      className={`flex ${VARIANTS[variant].form} ${className}`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={boxRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={4000}
        aria-label={label}
        placeholder={busy ? "正在处理…" : placeholder}
        className={`max-h-40 min-w-0 flex-1 resize-none text-(--ink) outline-none placeholder:text-(--ink-soft) ${VARIANTS[variant].input}`}
      />
      <button
        type="submit"
        disabled={busy || !ready || !draft.trim()}
        aria-label="发送"
        className={`grid shrink-0 place-items-center bg-(--ink) text-(--surface) transition hover:brightness-110 disabled:opacity-35 ${VARIANTS[variant].button}`}
      >
        <Icon name="arrow-up" size={21} />
      </button>
    </form>
  );
}
