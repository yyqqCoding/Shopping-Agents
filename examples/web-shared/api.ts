// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { AnonymousIdentity, ApiError, browserLock } from "./identity";
import type { AgentEvent, Conversation, MemoryFact, Order, StoredTurn } from "./protocol";
export { ApiError } from "./identity";

export interface PendingChat { requestId: string; message: string; failure?: string; }

export class AgentApi {
  session: string | null = null;
  readonly base: string;
  private identity: AnonymousIdentity | null = null;
  private bootstrap: Promise<string> | null = null;
  private userId: string | null = null;

  constructor(readonly root: string, prefix: string) {
    this.base = `${root}${prefix}`;
  }

  /** Product images are served by the web origin, not the API origin. */
  assetUrl(path: string | null | undefined): string | null { return path || null; }

  async initialize(): Promise<string> {
    if (!this.bootstrap) {
      this.bootstrap = (async () => {
        const config = await this.requestOrThrow<{ supabase_url: string; supabase_key: string }>("/config");
        this.identity = new AnonymousIdentity(config.supabase_url, config.supabase_key);
        const credential = await this.identity.credential();
        this.userId = credential.user.id;
        return this.userId;
      })().catch((error) => { this.bootstrap = null; throw error; });
    }
    return this.bootstrap;
  }

  private async headers(json = false, sessionId = this.session, authenticated = true): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    if (authenticated && sessionId) headers["X-Session-Id"] = sessionId;
    if (json) headers["Content-Type"] = "application/json";
    if (authenticated && this.identity) headers.Authorization = `Bearer ${(await this.identity.credential()).access_token}`;
    return headers;
  }

  async requestOrThrow<T>(path: string, init: RequestInit = {}): Promise<T> {
    const publicPath = /^\/(?:config|health|products)(?:[/?]|$)/.test(path);
    const headers = { ...await this.headers(Boolean(init.body), this.session, !publicPath), ...init.headers };
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        ...init,
        signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        headers,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiError(0, "暂时无法连接服务，请稍后重试。");
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(response.status, typeof data.detail === "string" ? data.detail : "请求未完成，请稍后重试。");
    }
    return await response.json() as T;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T | null> {
    const query = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
    try { return await this.requestOrThrow<T>(`${path}${query}`); } catch { return null; }
  }

  async post<T>(path: string, body?: unknown): Promise<T | null> { return this.send<T>("POST", path, body); }
  async patch<T>(path: string, body: unknown): Promise<T | null> { return this.send<T>("PATCH", path, body); }
  async delete<T>(path: string, body?: unknown): Promise<T | null> { return this.send<T>("DELETE", path, body); }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    try {
      return await this.requestOrThrow<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { return null; }
  }

  listConversations(offset = 0): Promise<{ conversations: Conversation[]; has_more: boolean }> {
    return this.requestOrThrow(`/conversations?offset=${offset}&limit=30`);
  }

  fetchHistory(id: string, before?: number, signal?: AbortSignal): Promise<{ turns: StoredTurn[]; has_more: boolean }> {
    const query = new URLSearchParams({ limit: "30" });
    if (before) query.set("before", String(before));
    return this.requestOrThrow(`/conversations/${encodeURIComponent(id)}/turns?${query}`, { signal });
  }

  fetchTurn(id: string, requestId: string, signal?: AbortSignal): Promise<StoredTurn> {
    return this.requestOrThrow(`/conversations/${encodeURIComponent(id)}/turns/${encodeURIComponent(requestId)}`, { signal });
  }

  pendingChat(id: string): PendingChat | null {
    const raw = sessionStorage.getItem(`${this.selectionKey}:${id}:turn`);
    return raw ? JSON.parse(raw) as PendingChat : null;
  }

  prepareChat(id: string, message: string): PendingChat {
    const pending = this.pendingChat(id);
    if (pending) {
      if (pending.message !== message) throw new Error("请先确认上一条消息的处理结果。");
      return pending;
    }
    const request = { requestId: crypto.randomUUID(), message };
    sessionStorage.setItem(`${this.selectionKey}:${id}:turn`, JSON.stringify(request));
    return request;
  }

  clearPendingChat(id: string, requestId: string): void {
    if (this.pendingChat(id)?.requestId === requestId) sessionStorage.removeItem(`${this.selectionKey}:${id}:turn`);
  }

  notePendingError(id: string, requestId: string, failure: string): void {
    const pending = this.pendingChat(id);
    if (pending?.requestId === requestId) sessionStorage.setItem(`${this.selectionKey}:${id}:turn`, JSON.stringify({ ...pending, failure }));
  }

  private get selectionKey(): string { return `acme.conversation:${this.userId}`; }

  selectConversation(id: string): void {
    this.session = id;
    sessionStorage.setItem(this.selectionKey, id);
    localStorage.setItem(this.selectionKey, id);
  }

  async createConversation(initial = false): Promise<Conversation> {
    await this.initialize();
    const pendingKey = `${this.selectionKey}:${initial ? "initial" : "pending"}`;
    const storage = initial ? localStorage : sessionStorage;
    const requestId = storage.getItem(pendingKey) || crypto.randomUUID();
    storage.setItem(pendingKey, requestId);
    const result = await this.requestOrThrow<{ conversation: Conversation }>("/conversations", {
      method: "POST", body: JSON.stringify({ request_id: requestId }),
    });
    this.selectConversation(result.conversation.id);
    if (!initial) storage.removeItem(pendingKey);
    return result.conversation;
  }

  async restoreConversation(): Promise<string> {
    const userId = await this.initialize();
    return browserLock(`acme.first-conversation:${userId}`, async () => {
      const chosen = sessionStorage.getItem(this.selectionKey) || localStorage.getItem(this.selectionKey);
      if (chosen) {
        try {
          await this.fetchHistory(chosen);
          this.selectConversation(chosen);
          return chosen;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
        }
      }
      const { conversations } = await this.listConversations();
      const id = conversations[0]?.id ?? (await this.createConversation(true)).id;
      this.selectConversation(id);
      return id;
    });
  }

  async startSession(): Promise<{ sessionId: string }> {
    return { sessionId: await this.restoreConversation() };
  }

  async fetchMemory(): Promise<MemoryFact[] | null> {
    return (await this.get<{ facts: MemoryFact[] }>("/memory"))?.facts ?? null;
  }
  async editMemoryFact(key: string, value: string): Promise<MemoryFact | null> {
    return (await this.patch<{ fact: MemoryFact }>("/memory", { key, value }))?.fact ?? null;
  }
  async forgetMemoryFact(key: string): Promise<boolean> {
    return (await this.delete<{ ok: boolean }>("/memory", { key }))?.ok ?? false;
  }
  fetchCart<T>(): Promise<T | null> { return this.get<T>("/cart"); }
  async fetchOrders(): Promise<Order[] | null> { return (await this.get<{ orders: Order[] }>("/orders"))?.orders ?? null; }

  async *chatStream(message: string, requestId: string, sessionId: string, signal: AbortSignal): AsyncGenerator<AgentEvent> {
    const headers = await this.headers(true, sessionId);
    let response: Response;
    try {
      response = await fetch(`${this.base}/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message, request_id: requestId }), signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiError(0, "连接暂时中断，请确认本轮处理结果后重试。");
    }
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(response.status, typeof data.detail === "string" ? data.detail : "回复暂时不可用，请稍后重试。");
    }
    let settled = false;
    for await (const event of readEventStream(response.body)) {
      if (event.type === "turn_complete" || event.type === "error") settled = true;
      yield event;
    }
    if (!settled) throw new Error("连接中断，请刷新历史确认本轮结果，避免重复操作。");
  }
}

async function* readEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType: string | null = null;
  try { while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trimEnd();
      buffer = buffer.slice(newline + 1);
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ") && eventType) {
        try {
          yield { type: eventType, data: JSON.parse(line.slice(6)) } as AgentEvent;
        } catch {
          // A malformed frame is dropped; the stream continues.
        }
      } else if (line === "") {
        eventType = null;
      }
    }
  } } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
