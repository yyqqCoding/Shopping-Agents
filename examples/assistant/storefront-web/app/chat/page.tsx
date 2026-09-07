// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  type AgentEvent,
  Conversations,
  formatMoney,
  StoreShell,
  type StoreView,
  useAgentTurn,
  useSession,
} from "web-shared";
import CartPanel from "@/components/CartPanel";
import Chat from "@/components/Chat";
import HomeView from "@/components/HomeView";
import OutdoorMark from "@/components/OutdoorMark";
import VisitorProfile, { useVisitorProfile } from "@/components/VisitorProfile";
import { api, UNREACHABLE } from "@/lib/api";
import type { CartPayload, CheckoutPayload } from "@/lib/types";

type View = "assistant";

const ASSISTANT = "户外装备助手";

function Wordmark() {
  return (
    <Link href="/" className="outdoor-wordmark">
      <OutdoorMark className="outdoor-mark" />
      <span>户外装备助手</span>
    </Link>
  );
}

export default function AssistantPage() {
  const session = useSession(api);
  const visitor = useVisitorProfile(Boolean(session.sessionId));
  const [view, setView] = useState<View>("assistant");
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [cartError, setCartError] = useState(false);
  const [cartReload, setCartReload] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [composerPrefill, setComposerPrefill] = useState<{
    text: string;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const draft = url.searchParams.get("draft");
    if (!draft) return;
    setComposerPrefill({ text: draft.slice(0, 4000), nonce: Date.now() });
    url.searchParams.delete("draft");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  const handleCartUpdate = useCallback((next: CartPayload) => {
    setCart(next);
    setCartError(false);
  }, []);

  const onEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === "cart_update")
        handleCartUpdate(event.data.cart as CartPayload);
    },
    [handleCartUpdate],
  );

  const chat = useAgentTurn(api, {
    sessionId: session.sessionId,
    unreachable: UNREACHABLE,
    onEvent,
    onTurnEnd: session.refresh,
  });

  useEffect(() => {
    setCart(null);
    setCartError(false);
  }, [session.sessionId]);

  useEffect(() => {
    let current = true;
    if (session.sessionId)
      void api.fetchCart<CartPayload>().then((next) => {
        if (!current) return;
        if (next) setCart(next);
        setCartError(!next);
      });
    return () => {
      current = false;
    };
  }, [session.sessionId, chat.completed, cartReload]);

  const lastCheckout = chat.items
    .flatMap((item) => (item.kind === "assistant" ? item.segments : []))
    .filter(
      (segment) =>
        segment.type === "ui" &&
        segment.status === "final" &&
        segment.block.component === "checkout",
    )
    .at(-1);
  const stagedCart =
    lastCheckout?.type === "ui"
      ? (lastCheckout.block.payload as CheckoutPayload).cart
      : null;
  const cartKey = (value: CartPayload) =>
    `${value.currency}:${value.items
      .map((item) => `${item.product_id}:${item.price}:${item.quantity}`)
      .sort()
      .join("|")}`;
  const checkoutStaged = !!(
    cart &&
    stagedCart &&
    cartKey(cart) === cartKey(stagedCart)
  );

  const views: StoreView<View>[] = [
    { id: "assistant", label: "户外装备助手", icon: "spark" },
  ];
  const count = cart?.item_count ?? 0;

  return (
    <StoreShell
      brand={<Wordmark />}
      views={views}
      view={view}
      onViewChange={setView}
      chat={chat}
      assistantName={ASSISTANT}
      composerPrefill={composerPrefill}
      headerActions={
        <Link href="/equipment" className="workspace-catalog-link">
          逛逛装备 <span aria-hidden="true">↗</span>
        </Link>
      }
      sidebar={(onNavigate) => (
        <Conversations
          session={session}
          busy={chat.busy}
          onNavigate={onNavigate}
        />
      )}
      conversationTitle={
        session.conversations.find((item) => item.id === session.sessionId)
          ?.title || "新的户外计划"
      }
      sidebarFooter={<VisitorProfile {...visitor} />}
      bag={{
        label: "购物车",
        count,
        noun: "件商品",
        figure: count ? formatMoney(cart?.subtotal ?? 0, cart?.currency) : null,
      }}
      panel={<CartPanel cart={cart} checkoutStaged={checkoutStaged} />}
      panelOpen={panelOpen}
      onPanelOpenChange={setPanelOpen}
      placeholder="聊聊行程，或想挑选的装备…"
      banner={
        session.error || chat.historyError || cartError ? (
          <div
            role="status"
            className="flex items-center justify-center gap-3 bg-(--warn-soft) px-4 py-2 text-sm text-(--warn)"
          >
            {session.error ||
              chat.historyError ||
              "购物车暂时无法读取，请重试。"}
            <button
              type="button"
              className="shrink-0 underline"
              disabled={chat.busy}
              onClick={
                session.error
                  ? session.retry
                  : chat.historyError
                    ? chat.pendingRetry
                      ? chat.retryPending
                      : chat.reloadHistory
                    : () => setCartReload((n) => n + 1)
              }
            >
              {chat.pendingRetry && !session.error ? "重试发送" : "重试"}
            </button>
          </div>
        ) : null
      }
    >
      <div className="h-full">
        <Chat chat={chat} onCartUpdate={handleCartUpdate} home={<HomeView />} />
      </div>
    </StoreShell>
  );
}
