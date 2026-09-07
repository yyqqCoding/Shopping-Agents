"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import type { Session } from "./session";

function groupLabel(value: string, today: Date | null): string {
  if (!today) return "历史对话";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更早";
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const age = Math.round((midnight.getTime() - day.getTime()) / 86400000);
  return age <= 0 ? "今天" : age === 1 ? "昨天" : age < 7 ? "最近七天" : "更早";
}

export function Conversations({ session, busy, onNavigate }: { session: Session; busy: boolean; onNavigate?: () => void }) {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setToday(new Date());
    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const groups = new Map<string, typeof session.conversations>();
  for (const conversation of session.conversations) {
    const label = groupLabel(conversation.updated_at, today);
    const group = groups.get(label) ?? [];
    group.push(conversation);
    groups.set(label, group);
  }
  return (
    <>
      <div className="sidebar-new-conversation">
        <button type="button" disabled={busy || session.loading || !session.sessionId} onClick={() => { void session.newConversation(); onNavigate?.(); }}>
          <Icon name="plus" size={20} /><span>新对话</span><Icon name="edit" size={17} />
        </button>
      </div>
      <nav className="sidebar-conversations panel-scroll" aria-label="对话列表" aria-busy={session.loading}>
        {[...groups].map(([label, conversations]) => (
          <div key={label} className="conversation-group">
            <h2>{label}</h2>
            {conversations.map((conversation) => (
              <button type="button" key={conversation.id} title={conversation.title || "新对话"} disabled={busy || session.loading}
                aria-current={conversation.id === session.sessionId ? "page" : undefined}
                onClick={() => { session.selectConversation(conversation.id); onNavigate?.(); }}>
                <Icon name="message" size={17} /><span>{conversation.title || "新对话"}</span>
              </button>
            ))}
          </div>
        ))}
        {!session.conversations.length ? <p className="sidebar-empty">{session.loading ? "正在恢复对话…" : "从一次出行开始，\n你的对话会留在这里。"}</p> : null}
        {session.hasMore ? <button type="button" className="sidebar-load-more" disabled={session.loading || busy} onClick={() => void session.loadMore()}>加载更多对话</button> : null}
      </nav>
    </>
  );
}
