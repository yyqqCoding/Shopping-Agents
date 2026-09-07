// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import type { ReactNode } from "react";
import { useStickToBottom } from "../scroll";
import { LatestPill, Transcript, type TranscriptProps } from "../Transcript";
import type { AgentTurn } from "../turn";

/** The storefronts' conversation page: the home until the first message, then the transcript. */
export function Chat({
  chat,
  home,
  renderBlock,
  renderPending,
  wide,
}: {
  chat: AgentTurn;
  home: ReactNode;
  renderBlock: TranscriptProps["renderBlock"];
  renderPending?: TranscriptProps["renderPending"];
  /** Components that may extend past the text measure when the page has room. */
  wide?: ReadonlySet<string>;
}) {
  const { scrollRef, onScroll, showLatest, jumpToLatest } = useStickToBottom(chat.items, chat.busy);
  return (
    <div className="relative h-full">
      <div ref={scrollRef} onScroll={onScroll} style={{ overflowAnchor: "none" }} className="panel-scroll h-full overflow-y-auto px-4 pb-24 pt-6 sm:px-6">
        <div className="conversation-column flex flex-col gap-7 text-[17px] leading-[1.75] sm:text-[18px]">
          {chat.hasEarlier ? (
            <button type="button" disabled={chat.historyLoading || chat.busy} className="text-sm text-(--ink-soft) underline disabled:opacity-50" onClick={() => void chat.loadEarlier()}>加载更早的对话</button>
          ) : null}
          {chat.historyLoading && chat.items.length === 0 ? <p role="status" className="py-8 text-center text-sm text-(--ink-soft)">正在恢复对话…</p> : chat.items.length === 0 ? (
            home
          ) : (
            <Transcript items={chat.items} busy={chat.busy} send={chat.send} renderBlock={renderBlock} renderPending={renderPending} wide={wide} />
          )}
        </div>
      </div>
      {showLatest ? <LatestPill onClick={jumpToLatest} /> : null}
    </div>
  );
}
