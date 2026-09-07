// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useCallback, useEffect, useState } from "react";
import { type AgentEvent, Conversations, formatMoney, StoreShell, type StoreView, useAgentTurn, useSession } from "web-shared";
import CartPanel from "@/components/CartPanel";
import Chat from "@/components/Chat";
import HomeView from "@/components/HomeView";
import { api, UNREACHABLE } from "@/lib/api";
import type { CartPayload, CheckoutPayload } from "@/lib/types";

type View = "assistant";

const ASSISTANT = "ACME 购物助手";

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 pr-1">
      <span aria-hidden className="font-display grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-(--ink) text-[17px] italic text-(--surface) shadow-(--shadow-sm)">
        A
      </span>
      <span className="text-[17px] font-bold tracking-[-0.02em] text-(--ink)">ACME</span>
      <span className="hidden text-[13px] font-medium text-(--ink-soft) sm:inline">购物助手</span>
    </span>
  );
}

export default function AssistantPage() {
  const session = useSession(api);
  const [view, setView] = useState<View>("assistant");
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [cartError, setCartError] = useState(false);
  const [cartReload, setCartReload] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  const handleCartUpdate = useCallback((next: CartPayload) => {
    setCart(next);
    setCartError(false);
  }, []);

  const onEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === "cart_update") handleCartUpdate(event.data.cart as CartPayload);
    },
    [handleCartUpdate],
  );

  const chat = useAgentTurn(api, { sessionId: session.sessionId, unreachable: UNREACHABLE, onEvent, onTurnEnd: session.refresh });

  useEffect(() => {
    setCart(null);
    setCartError(false);
  }, [session.sessionId]);

  useEffect(() => {
    let current = true;
    if (session.sessionId) void api.fetchCart<CartPayload>().then((next) => {
      if (!current) return;
      if (next) setCart(next);
      setCartError(!next);
    });
    return () => { current = false; };
  }, [session.sessionId, chat.completed, cartReload]);

  const lastCheckout = chat.items.flatMap((item) => item.kind === "assistant" ? item.segments : [])
    .filter((segment) => segment.type === "ui" && segment.status === "final" && segment.block.component === "checkout").at(-1);
  const stagedCart = lastCheckout?.type === "ui" ? (lastCheckout.block.payload as CheckoutPayload).cart : null;
  const cartKey = (value: CartPayload) => `${value.currency}:${value.items.map((item) => `${item.product_id}:${item.price}:${item.quantity}`).sort().join("|")}`;
  const checkoutStaged = !!(cart && stagedCart && cartKey(cart) === cartKey(stagedCart));

  const views: StoreView<View>[] = [{ id: "assistant", label: "购物助手", icon: "spark" }];
  const count = cart?.item_count ?? 0;

  return (
    <StoreShell
      brand={<Wordmark />}
      views={views}
      view={view}
      onViewChange={setView}
      chat={chat}
      assistantName={ASSISTANT}
      headerActions={<Conversations session={session} busy={chat.busy} />}
      bag={{ label: "购物车", count, noun: "件商品", figure: count ? formatMoney(cart?.subtotal ?? 0, cart?.currency) : null }}
      panel={<CartPanel cart={cart} checkoutStaged={checkoutStaged} />}
      panelOpen={panelOpen}
      onPanelOpenChange={setPanelOpen}
      placeholder="告诉我你想买什么，或正在规划什么…"
      banner={session.error || chat.historyError || cartError ? (
        <div role="status" className="flex items-center justify-center gap-3 bg-(--warn-soft) px-4 py-2 text-sm text-(--warn)">
          {session.error || chat.historyError || "购物车暂时无法读取，请重试。"}
          <button type="button" className="shrink-0 underline" disabled={chat.busy} onClick={session.error ? session.retry : chat.historyError ? (chat.pendingRetry ? chat.retryPending : chat.reloadHistory) : () => setCartReload((n) => n + 1)}>{chat.pendingRetry && !session.error ? "重试发送" : "重试"}</button>
        </div>
      ) : null}
    >
      <div className="h-full">
        <Chat chat={chat} onCartUpdate={handleCartUpdate} home={<HomeView />} />
      </div>
    </StoreShell>
  );
}
