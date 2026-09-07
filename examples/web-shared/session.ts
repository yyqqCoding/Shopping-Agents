"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentApi } from "./api";
import type { Conversation } from "./protocol";

export interface Session {
  sessionId: string | null;
  conversations: Conversation[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  newConversation: () => Promise<void>;
  selectConversation: (id: string) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  retry: () => void;
}

export function useSession(api: AgentApi): Session {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const creating = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const result = await api.listConversations();
      setConversations(result.conversations);
      setHasMore(result.has_more);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "历史列表暂时无法读取。");
    }
  }, [api]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const id = await api.restoreConversation();
        if (!current) return;
        setSessionId(id);
        await refresh();
      } catch (error) {
        if (current) setError(error instanceof Error ? error.message : "暂时无法恢复对话，请重试。");
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [api, attempt, refresh]);

  const selectConversation = useCallback((id: string) => {
    api.selectConversation(id);
    setSessionId(id);
    setError(null);
  }, [api]);

  const newConversation = useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    setLoading(true);
    try {
      const conversation = await api.createConversation();
      selectConversation(conversation.id);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "暂时无法新建对话，请重试。");
    } finally {
      creating.current = false;
      setLoading(false);
    }
  }, [api, refresh, selectConversation]);

  const loadMore = useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    setLoading(true);
    try {
      const result = await api.listConversations(conversations.length);
      setConversations((previous) => [...previous, ...result.conversations.filter((c) => !previous.some((old) => old.id === c.id))]);
      setHasMore(result.has_more);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "历史列表暂时无法读取。");
    } finally {
      creating.current = false;
      setLoading(false);
    }
  }, [api, conversations.length]);

  return { sessionId, conversations, hasMore, loading, error, newConversation, selectConversation, refresh, loadMore, retry: () => setAttempt((n) => n + 1) };
}
