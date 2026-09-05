// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useCallback, useEffect, useState } from "react";
import { type AgentEvent, formatMoney, StoreShell, type StoreView, useAgentTurn, useSession } from "web-shared";
import CartPanel from "@/components/CartPanel";
import Chat from "@/components/Chat";
import HomeView from "@/components/HomeView";
import { api, UNREACHABLE } from "@/lib/api";
import type { CartPayload } from "@/lib/types";

type View = "assistant";

const ASSISTANT = "ACME Assistant";

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 pr-1">
      <span aria-hidden className="font-display grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-(--ink) text-[17px] italic text-(--surface) shadow-(--shadow-sm)">
        A
      </span>
      <span className="text-[17px] font-bold tracking-[-0.02em] text-(--ink)">ACME</span>
      <span className="hidden text-[13px] font-medium text-(--ink-soft) sm:inline">Assistant</span>
    </span>
  );
}

export default function AssistantPage() {
  const session = useSession(api);
  const [view, setView] = useState<View>("assistant");
  const [cart, setCart] = useState<CartPayload | null>(null);
  // A staged checkout owns the panel's primary action until the cart changes again.
  const [checkoutStaged, setCheckoutStaged] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const handleCartUpdate = useCallback((next: CartPayload) => {
    setCart(next);
    setCheckoutStaged(false);
  }, []);

  const onEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === "cart_update") handleCartUpdate(event.data.cart as CartPayload);
      else if (event.type === "ui" && event.data.component === "checkout") setCheckoutStaged(true);
    },
    [handleCartUpdate],
  );

  const chat = useAgentTurn(api, { ...session, unreachable: UNREACHABLE, onEvent });

  useEffect(() => {
    if (session.sessionId) void api.fetchCart<CartPayload>().then((next) => next && setCart(next));
  }, [session.sessionId]);

  const views: StoreView<View>[] = [{ id: "assistant", label: "Assistant", icon: "spark" }];
  const shopper = session.shopper ?? { name: "Guest" };
  const count = cart?.item_count ?? 0;

  return (
    <StoreShell
      brand={<Wordmark />}
      views={views}
      view={view}
      onViewChange={setView}
      chat={chat}
      api={api}
      assistantName={ASSISTANT}
      shopper={shopper}
      bag={{ label: "Cart", count, noun: "item", figure: count ? formatMoney(cart?.subtotal ?? 0, cart?.currency) : null }}
      panel={<CartPanel cart={cart} checkoutStaged={checkoutStaged} />}
      panelOpen={panelOpen}
      onPanelOpenChange={setPanelOpen}
      placeholder="Ask about a product, a project, an order…"
    >
      <div className="h-full">
        <Chat chat={chat} onCartUpdate={handleCartUpdate} home={<HomeView shopperName={shopper.name} />} />
      </div>
    </StoreShell>
  );
}
