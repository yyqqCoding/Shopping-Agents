"use client";

import { useState } from "react";
import type { Session } from "./session";
import { Button, Sheet } from "./ui";

export function Conversations({ session, busy }: { session: Session; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>历史对话</Button>
      <Button size="sm" disabled={busy || session.loading || !session.sessionId} onClick={() => void session.newConversation()}>新对话</Button>
      {open ? (
        <Sheet title="历史对话" closeLabel="关闭历史对话" onClose={() => setOpen(false)}>
          {session.conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              disabled={busy || session.loading}
              aria-current={conversation.id === session.sessionId ? "true" : undefined}
              className="rounded-xl border border-(--line) p-3 text-left transition hover:bg-(--well) aria-current:bg-(--accent-soft) disabled:opacity-50"
              onClick={() => { session.selectConversation(conversation.id); setOpen(false); }}
            >
              <span className="block truncate text-sm font-medium">{conversation.title || "新对话"}</span>
              <time className="mt-1 block text-xs text-(--ink-soft)" dateTime={conversation.updated_at}>
                {new Date(conversation.updated_at).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </time>
            </button>
          ))}
          {!session.conversations.length ? <p className="text-sm text-(--ink-soft)">还没有历史对话。</p> : null}
          {session.hasMore ? <Button disabled={session.loading} onClick={() => void session.loadMore()}>加载更多</Button> : null}
        </Sheet>
      ) : null}
    </>
  );
}
