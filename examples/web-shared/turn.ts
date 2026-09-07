// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiError, type AgentApi, type PendingChat } from "./api";
import type {
  AgentEvent,
  AssistantChatItem,
  AssistantSegment,
  ChatItem,
  StoredTurn,
  ToolCallData,
  TraceEntry,
  UIBlock,
  UISlotStatus,
} from "./protocol";
import { describeToolCall } from "./tool-copy";

/** Pace between structural items when a burst arrives at once. */
const DRIP_MS = 180;
/** Pace once the final payload is waiting behind the queue. */
const FAST_DRIP_MS = 80;
/** Queue depth above which every second frame is dropped. */
const MAX_QUEUE = 8;
/** The arrays the server's partial signature counts, in its order. */
const STRUCTURAL_KEYS = ["items", "entries", "steps", "days", "sections", "metrics"] as const;
/** Consumed here; never reaches an app's component registry. */
const CHIPS_COMPONENT = "suggestions";


function structuralCount(block: UIBlock): number {
  const payload = block.payload as Record<string, unknown>;
  for (const key of STRUCTURAL_KEYS) {
    const value = payload[key];
    if (Array.isArray(value)) return value.length;
  }
  return 0;
}

function structuralPrefix(block: UIBlock, count: number): UIBlock {
  const payload = block.payload as Record<string, unknown>;
  for (const key of STRUCTURAL_KEYS) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return { ...block, payload: { ...payload, [key]: value.slice(0, count) } };
    }
  }
  return block;
}

function eventBlock(event: AgentEvent): UIBlock {
  return { component: String(event.data.component ?? ""), payload: event.data.payload ?? {} };
}

/** Keyed by turn + component + ordinal, not tool_use id, so a retry keeps the card's DOM node. */
interface Slot {
  key: string;
  component: string;
  streamId?: string;
  status: UISlotStatus;
  rendered: number;
  queue: UIBlock[];
  timer: number | null;
  final: UIBlock | null;
}

export interface AgentTurnOptions {
  sessionId: string | null;
  unreachable: string;
  /** Runs before the transcript handles the event. */
  onEvent?: (event: AgentEvent, turn: number) => void;
  onTurnEnd?: (turn: number) => void;
  /** Skeleton to mount on `tool_call` for tools whose card arrives in one final event. */
  pendingComponent?: (tool: string) => string | null | undefined;
}

export interface AgentTurn {
  items: ChatItem[];
  setItems: Dispatch<SetStateAction<ChatItem[]>>;
  ready: boolean;
  /** A reply is streaming. */
  busy: boolean;
  send: (text: string) => Promise<void>;
  turnCount: number;
  /** Replies that have finished; a page re-reads what a reply may have changed when it moves. */
  completed: number;
  streaming: boolean;
  trace: TraceEntry[];
  historyError: string | null;
  historyLoading: boolean;
  pendingRetry: boolean;
  retryPending: () => Promise<void>;
  hasEarlier: boolean;
  loadEarlier: () => Promise<void>;
  reloadHistory: () => void;

}

/** Restore display fragments without replaying events or tool side effects. */
export function historyItems(turns: StoredTurn[]): ChatItem[] {
  return turns.flatMap((turn): ChatItem[] => {
    const segments: AssistantSegment[] = [];
    let suggestions: string[] = [];
    for (const [index, fragment] of turn.display.entries()) {
      if (fragment.type === "suggestions") suggestions = fragment.suggestions;
      else if (fragment.type === "ui") segments.push({ type: "ui", block: fragment.block, slotKey: `${turn.id}-${index}`, status: "final" });
      else segments.push(fragment);
    }
    if (["interrupted", "error"].includes(turn.status) && !segments.some((s) => s.type === "error")) {
      segments.push({ type: "error", text: "上一轮回复未完成，已完成的操作仍然保留。" });
    }
    return [
      { kind: "user", text: turn.message },
      { kind: "assistant", turn: turn.sequence, segments, suggestions, pending: turn.status === "running", tools: [] },
    ];
  });
}

export function useAgentTurn(api: AgentApi, options: AgentTurnOptions): AgentTurn {
  const { sessionId, unreachable, onEvent, onTurnEnd, pendingComponent } = options;
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [turnState, setTurnState] = useState({ turnCount: 0, completed: 0, streaming: false });
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyReady, setHistoryReady] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [reload, setReload] = useState(0);
  const oldest = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const loadingEarlier = useRef(false);
  const turnRef = useRef(0);
  const slotsRef = useRef<Map<string, Slot>>(new Map());
  const slotByStream = useRef<Map<string, string>>(new Map());
  const ordinals = useRef<Map<string, number>>(new Map());
  // Prose on both sides of a tool call shares a segment; the boundary gets a paragraph break.
  const afterToolRef = useRef(false);
  // The tool whose progress line is the current activity; its tool_result clears the line.
  const progressToolRef = useRef<string | null>(null);
  const callbacks = useRef({ onEvent, onTurnEnd, pendingComponent });
  callbacks.current = { onEvent, onTurnEnd, pendingComponent };

  const clearTimers = useCallback(() => {
    for (const slot of slotsRef.current.values()) {
      if (slot.timer != null) window.clearTimeout(slot.timer);
      slot.timer = null;
    }
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const updateTurn = useCallback(
    (turn: number, update: (item: AssistantChatItem) => AssistantChatItem) => {
      setItems((previous) =>
        previous.map((item) =>
          item.kind === "assistant" && item.turn === turn ? update(item) : item,
        ),
      );
    },
    [],
  );

  const appendTrace = useCallback((entry: Omit<TraceEntry, "at">) => {
    setTrace((previous) => [...previous, { ...entry, at: performance.now() }]);
  }, []);

  useEffect(() => {
    const current = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    clearTimers();
    sending.current = false;
    loadingEarlier.current = false;
    oldest.current = undefined;
    setBusy(false);
    setHistoryReady(false);
    setHistoryError(null);
    setPendingRetry(false);
    setHasEarlier(false);
    setItems([]);
    setTrace([]);
    setTurnState({ turnCount: 0, completed: 0, streaming: false });
    let poll: number | undefined;
    const hydrate = async () => {
      if (!sessionId) { setHistoryLoading(false); return; }
      setHistoryLoading(true);
      try {
        const result = await api.fetchHistory(sessionId, undefined, controller.current?.signal);
        const pending = api.pendingChat(sessionId);
        let unresolved = false;
        let pendingRunning = false;
        if (pending) {
          let stored = result.turns.find((t) => t.request_id === pending.requestId);
          if (!stored) {
            try { stored = await api.fetchTurn(sessionId, pending.requestId, controller.current?.signal); }
            catch (error) {
              if (!(error instanceof ApiError) || error.status !== 404) throw error;
            }
          }
          if (stored && stored.status !== "running") api.clearPendingChat(sessionId, pending.requestId);
          else if (stored) pendingRunning = true;
          else unresolved = true;
        }
        if (current !== generation.current) return;
        setItems(historyItems(result.turns));
        turnRef.current = result.turns.at(-1)?.sequence ?? 0;
        oldest.current = result.turns[0]?.sequence;
        setHasEarlier(result.has_more);
        setTurnState({ turnCount: turnRef.current, completed: result.turns.filter((t) => t.status === "complete").length, streaming: false });
        const running = pendingRunning || result.turns.some((t) => t.status === "running");
        setPendingRetry(unresolved);
        setHistoryReady(!running && !unresolved);
        setHistoryError(running ? "上一轮仍在处理中，完成后会自动更新。" : unresolved ? (pending?.failure ?? "上一条消息尚未确认发送，请重试这条消息。") : null);
        if (running) poll = window.setTimeout(() => void hydrate(), 3000);
      } catch (error) {
        if (current === generation.current) setHistoryError(error instanceof Error ? error.message : "历史暂时无法读取，请重试。");
      } finally {
        if (current === generation.current) setHistoryLoading(false);
      }
    };
    void hydrate();
    return () => {
      generation.current++;
      controller.current?.abort();
      window.clearTimeout(poll);
      clearTimers();
    };
  }, [api, sessionId, reload, clearTimers]);

  const loadEarlier = useCallback(async () => {
    if (!sessionId || !oldest.current || historyLoading || loadingEarlier.current) return;
    const current = generation.current;
    loadingEarlier.current = true;
    setHistoryLoading(true);
    try {
      const result = await api.fetchHistory(sessionId, oldest.current, controller.current?.signal);
      if (current !== generation.current) return;
      setItems((items) => [...historyItems(result.turns), ...items]);
      oldest.current = result.turns[0]?.sequence ?? oldest.current;
      setHasEarlier(result.has_more);
    } catch (error) {
      if (current === generation.current) setHistoryError(error instanceof Error ? error.message : "历史暂时无法读取。");
    } finally {
      if (current === generation.current) {
        loadingEarlier.current = false;
        setHistoryLoading(false);
      }
    }
  }, [api, sessionId, historyLoading]);

  const commit = useCallback(
    (turn: number, slot: Slot, block: UIBlock, status: UISlotStatus) => {
      slot.status = status;
      slot.rendered = structuralCount(block);
      updateTurn(turn, (item) => {
        const segments = [...item.segments];
        const index = segments.findIndex((s) => s.type === "ui" && s.slotKey === slot.key);
        const segment: AssistantSegment = { type: "ui", block, slotKey: slot.key, status };
        if (index >= 0) segments[index] = segment;
        else segments.push(segment);
        return { ...item, segments, activity: status === "pending" ? item.activity : undefined };
      });
    },
    [updateTurn],
  );

  const drain = useCallback(
    (turn: number, slot: Slot) => {
      slot.timer = null;
      const next = slot.queue.shift();
      if (next) {
        commit(turn, slot, next, "partial");
        if (slot.queue.length || slot.final) {
          const interval = slot.final ? FAST_DRIP_MS : DRIP_MS;
          slot.timer = window.setTimeout(() => drain(turn, slot), interval);
        }
      } else if (slot.final) {
        const block = slot.final;
        slot.final = null;
        commit(turn, slot, block, "final");
      }
    },
    [commit],
  );

  /** Cuts a partial into one-item steps so a burst lands item by item. */
  const schedule = useCallback(
    (turn: number, slot: Slot, block: UIBlock) => {
      const incoming = structuralCount(block);
      const queued = slot.queue[slot.queue.length - 1];
      const tail = queued ? structuralCount(queued) : slot.rendered;
      if (!slot.queue.length && slot.timer == null && incoming <= tail + 1) {
        commit(turn, slot, block, "partial");
        return;
      }
      if (slot.queue.length && incoming <= tail) {
        slot.queue[slot.queue.length - 1] = block;
        return;
      }
      for (let count = tail + 1; count < incoming; count++) {
        slot.queue.push(structuralPrefix(block, count));
      }
      slot.queue.push(block);
      if (slot.queue.length > MAX_QUEUE) {
        slot.queue = slot.queue.filter((_, i, all) => i % 2 === 1 || i === all.length - 1);
      }
      if (slot.timer != null) return;
      // The first frame shows at once; only growth is paced.
      if (slot.status === "pending") drain(turn, slot);
      else slot.timer = window.setTimeout(() => drain(turn, slot), DRIP_MS);
    },
    [commit, drain],
  );

  const flush = useCallback(
    (turn: number) => {
      for (const slot of slotsRef.current.values()) {
        if (slot.timer != null) window.clearTimeout(slot.timer);
        slot.timer = null;
        const last = slot.final ?? slot.queue[slot.queue.length - 1];
        const status: UISlotStatus = slot.final ? "final" : slot.status;
        slot.queue = [];
        slot.final = null;
        if (last) commit(turn, slot, last, status);
      }
    },
    [commit],
  );

  const openSlot = useCallback((turn: number, component: string, status: UISlotStatus, streamId?: string) => {
    const ordinal = ordinals.current.get(component) ?? 0;
    ordinals.current.set(component, ordinal + 1);
    const slot: Slot = {
      key: `${turn}-${component}-${ordinal}`,
      component,
      streamId,
      status,
      rendered: 0,
      queue: [],
      timer: null,
      final: null,
    };
    slotsRef.current.set(slot.key, slot);
    if (streamId) slotByStream.current.set(streamId, slot.key);
    return slot;
  }, []);

  const findSlot = useCallback((component: string, statuses?: UISlotStatus[]) => {
    let found: Slot | undefined;
    for (const slot of slotsRef.current.values()) {
      if (slot.component !== component) continue;
      if (!statuses || statuses.includes(slot.status)) found = slot;
    }
    return found;
  }, []);

  const handleEvent = useCallback(
    (turn: number, event: AgentEvent) => {
      callbacks.current.onEvent?.(event, turn);
      switch (event.type) {
        case "text_delta": {
          const delta = String(event.data.text ?? "");
          const afterTool = afterToolRef.current;
          afterToolRef.current = false;
          progressToolRef.current = null;
          updateTurn(turn, (item) => {
            const segments = [...item.segments];
            const last = segments[segments.length - 1];
            if (last?.type === "text") {
              const spaced = /\s$/.test(last.text) || /^\s/.test(delta);
              const gap = afterTool && last.text && !spaced ? "\n\n" : "";
              segments[segments.length - 1] = { type: "text", text: last.text + gap + delta };
            } else {
              segments.push({ type: "text", text: delta });
            }
            return { ...item, segments, activity: undefined };
          });
          return;
        }
        case "ui_partial": {
          const block = eventBlock(event);
          if (block.component === CHIPS_COMPONENT) return;
          const streamId = String(event.data.stream_id ?? "");
          const known = slotByStream.current.get(streamId);
          let slot = known ? slotsRef.current.get(known) : undefined;
          if (!slot) {
            // A new attempt adopts the component's skeleton or failed slot, else opens a new card.
            slot = findSlot(block.component, ["pending", "retrying"]);
            if (slot) {
              if (slot.timer != null) window.clearTimeout(slot.timer);
              slot.timer = null;
              slot.queue = [];
              slot.final = null;
              slot.rendered = 0;
              slot.status = "pending";
              slot.streamId = streamId;
            } else {
              slot = openSlot(turn, block.component, "pending", streamId);
            }
            slotByStream.current.set(streamId, slot.key);
          }
          schedule(turn, slot, block);
          return;
        }
        case "ui": {
          const block = eventBlock(event);
          if (block.component === CHIPS_COMPONENT) {
            const suggestions = (block.payload as { suggestions?: string[] }).suggestions ?? [];
            updateTurn(turn, (item) => ({ ...item, activity: undefined, suggestions }));
            return;
          }
          const streamId = event.data.stream_id ? String(event.data.stream_id) : undefined;
          const known = streamId ? slotByStream.current.get(streamId) : undefined;
          // Same adoption rule as ui_partial; a final without a stream id replaces the
          // component's card.
          const slot =
            (known ? slotsRef.current.get(known) : undefined) ??
            findSlot(block.component, streamId ? ["pending", "retrying"] : undefined) ??
            openSlot(turn, block.component, "final", streamId);
          if (streamId) {
            slot.streamId = streamId;
            slotByStream.current.set(streamId, slot.key);
          }
          if (slot.queue.length && slot.timer != null) {
            slot.final = block;
          } else {
            if (slot.timer != null) window.clearTimeout(slot.timer);
            slot.timer = null;
            slot.queue = [];
            slot.final = null;
            commit(turn, slot, block, "final");
          }
          return;
        }
        case "tool_call": {
          afterToolRef.current = true;
          progressToolRef.current = null;
          const data = event.data as Partial<ToolCallData>;
          const tool = String(data.tool ?? "tool");
          const input = data.input ?? {};
          // The model's own line for the call when it carries one, else the stock copy.
          const label = typeof data.label === "string" && /[\u3400-\u9fff]/.test(data.label) ? data.label.trim() : "";
          updateTurn(turn, (item) => ({
            ...item,
            tools: [...item.tools, tool],
            activity: label || describeToolCall(tool, input),
          }));
          const component = callbacks.current.pendingComponent?.(tool);
          if (component && !findSlot(component)) {
            const slot = openSlot(turn, component, "pending");
            commit(turn, slot, { component, payload: {} }, "pending");
          }
          const detail = JSON.stringify(input, null, 1);
          appendTrace({ kind: "tool_call", turn, label: tool, detail });
          return;
        }
        case "tool_result": {
          const resultTool = String(event.data.tool ?? "tool");
          if (progressToolRef.current === resultTool) {
            progressToolRef.current = null;
            updateTurn(turn, (item) => ({ ...item, activity: undefined }));
          }
          if (event.data.is_error) {
            // Streamed frames stay, dimmed, for the retry to adopt.
            const key = slotByStream.current.get(String(event.data.id ?? ""));
            const slot = key ? slotsRef.current.get(key) : undefined;
            if (slot?.status === "partial") {
              if (slot.timer != null) window.clearTimeout(slot.timer);
              slot.timer = null;
              const last = slot.queue[slot.queue.length - 1];
              slot.queue = [];
              slot.final = null;
              slot.status = "retrying";
              updateTurn(turn, (item) => ({
                ...item,
                segments: item.segments.map((s) =>
                  s.type === "ui" && s.slotKey === slot.key
                    ? { ...s, block: last ?? s.block, status: "retrying" }
                    : s,
                ),
              }));
            }
          }
          appendTrace({
            kind: "tool_result",
            turn,
            label: resultTool,
            detail: String(event.data.summary ?? ""),
            isError: Boolean(event.data.is_error),
            status: event.data.status ? String(event.data.status) : undefined,
            reason: event.data.reason ? String(event.data.reason) : undefined,
            excerpt: typeof event.data.excerpt === "string" ? event.data.excerpt : undefined,
          });
          return;
        }
        case "progress": {
          const message = String(event.data.message ?? "").trim();
          if (!message) return;
          progressToolRef.current = event.data.tool ? String(event.data.tool) : null;
          updateTurn(turn, (item) => ({ ...item, activity: /[\u3400-\u9fff]/.test(message) ? message : describeToolCall(String(event.data.tool ?? ""), {}) }));
          return;
        }
        case "error": {
          const text = String(event.data.message ?? "回复暂时失败，请重试。");
          updateTurn(turn, (item) => ({
            ...item,
            segments: [...item.segments, { type: "error", text }],
          }));
          appendTrace({ kind: "error", turn, label: "error", detail: text, isError: true });
          return;
        }
        default:
          return;
      }
    },
    [appendTrace, commit, findSlot, openSlot, schedule, updateTurn],
  );

  const runTurn = useCallback(
    async (userText: string, events: AsyncIterable<AgentEvent>, current: number): Promise<boolean> => {
      let completed = false;
      const turn = ++turnRef.current;
      const startedAt = performance.now();
      clearTimers();
      slotsRef.current = new Map();
      slotByStream.current = new Map();
      ordinals.current = new Map();
      afterToolRef.current = false;
      progressToolRef.current = null;
      setTurnState((state) => ({ ...state, turnCount: turn, streaming: true }));
      setItems((previous) => [
        ...previous,
        { kind: "user", text: userText },
        { kind: "assistant", turn, segments: [], suggestions: [], pending: true, tools: [] },
      ]);
      try {
        for await (const event of events) {
          if (current !== generation.current) return false;
          if (event.type === "turn_complete") {
            completed = true;
            const usage = (event.data.usage ?? {}) as Record<string, number>;
            const n = (value?: number) => (value ?? 0).toLocaleString("zh-CN");
            appendTrace({
              kind: "turn_complete",
              turn,
              label: "turn complete",
              detail:
                `in ${n(usage.input_tokens)} · out ${n(usage.output_tokens)}` +
                ` · cache read ${n(usage.cache_read_input_tokens)}`,
              elapsedMs: performance.now() - startedAt,
            });
            callbacks.current.onEvent?.(event, turn);
          } else {
            handleEvent(turn, event);
          }
        }
      } catch (error) {
        if (current !== generation.current) return false;
        const message = error instanceof Error && /[\u3400-\u9fff]/.test(error.message) ? error.message : unreachable;
        const pending = sessionId ? api.pendingChat(sessionId) : null;
        if (sessionId && pending) api.notePendingError(sessionId, pending.requestId, message);
        updateTurn(turn, (item) => ({ ...item, segments: [...item.segments, { type: "error", text: message }] }));
      } finally {
        if (current !== generation.current) return false;
        // Only server-validated final cards survive a settled or interrupted stream.
        flush(turn);
        updateTurn(turn, (item) => ({
          ...item,
          pending: false,
          activity: undefined,
          segments: item.segments.filter((s) => s.type !== "ui" || s.status === "final"),
        }));
        setTurnState((state) => ({ turnCount: turn, completed: state.completed + (completed ? 1 : 0), streaming: false }));
        callbacks.current.onTurnEnd?.(turn);
      }
      return completed;
    },
    [api, sessionId, appendTrace, clearTimers, flush, handleEvent, unreachable, updateTurn],
  );

  const transmit = useCallback(
    async (request: PendingChat) => {
      if (sending.current || !sessionId) return;
      const current = generation.current;
      const abort = new AbortController();
      controller.current = abort;
      sending.current = true;
      setBusy(true);
      try {
        const complete = await runTurn(request.message, api.chatStream(request.message, request.requestId, sessionId, abort.signal), current);
        if (complete) {
          api.clearPendingChat(sessionId, request.requestId);
          if (current === generation.current) {
            setHistoryReady(true);
            setPendingRetry(false);
            setHistoryError(null);
          }
        }
        else if (current === generation.current) {
          setHistoryReady(false);
          setReload((n) => n + 1);
        }
      } finally {
        if (current === generation.current) { sending.current = false; setBusy(false); }
      }
    },
    [api, sessionId, runTurn],
  );

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || sending.current || !sessionId || !historyReady) return;
    try { await transmit(api.prepareChat(sessionId, message)); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : unreachable); }
  }, [api, sessionId, historyReady, transmit, unreachable]);

  const retryPending = useCallback(async () => {
    if (!sessionId || !pendingRetry || sending.current) return;
    const pending = api.pendingChat(sessionId);
    if (pending) await transmit(pending);
  }, [api, sessionId, pendingRetry, transmit]);

  return {
    items,
    setItems,
    ready: sessionId != null && historyReady,
    busy,
    send,
    ...turnState,
    trace,
    historyError,
    historyLoading,
    pendingRetry,
    retryPending,
    hasEarlier,
    loadEarlier,
    reloadHistory: () => setReload((n) => n + 1),
  };
}
