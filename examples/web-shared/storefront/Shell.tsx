// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "../Composer";
import type { Prefill } from "../Composer";
import { Icon, type IconName } from "../icons";
import type { AgentTurn } from "../turn";
import { FrameContext } from "./frame";

export interface StoreView<V extends string> {
  id: V;
  label: string;
  icon: IconName;
  attention?: { count: number; label: string } | null;
}

export function StorePage({ children }: { children: ReactNode }) {
  return <div className="panel-scroll h-full overflow-y-auto"><div className="conversation-column flex flex-col gap-5 px-5 py-8">{children}</div></div>;
}

/** Conversation navigation stays on the left; the cart is a modal drawer at every size. */
export function StoreShell<V extends string>({
  brand, views, view, onViewChange, chat, assistantName, bag, panel, panelOpen,
  onPanelOpenChange, placeholder, banner, headerActions, sidebar, sidebarFooter,
  conversationTitle, composerPrefill, children,
}: {
  brand: ReactNode;
  views: StoreView<V>[];
  view: V;
  onViewChange: (view: V) => void;
  chat: AgentTurn;
  assistantName: string;
  bag: { label: string; count: number; noun: string; figure?: string | null; extra?: ReactNode };
  panel: ReactNode;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  placeholder: string;
  banner?: ReactNode;
  headerActions?: ReactNode;
  sidebar: (onNavigate: () => void) => ReactNode;
  sidebarFooter?: ReactNode;
  conversationTitle: string;
  composerPrefill?: Prefill | null;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const cartDialog = useRef<HTMLDialogElement>(null);
  const navigationDialog = useRef<HTMLDialogElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const home = views[0].id;
  const { send } = chat;
  const closePanel = useCallback(() => onPanelOpenChange(false), [onPanelOpenChange]);
  const closeNavigation = useCallback(() => setMobileNavigation(false), []);
  const ask = useCallback((message: string) => {
    onPanelOpenChange(false);
    onViewChange(home);
    void send(message);
  }, [home, onPanelOpenChange, onViewChange, send]);
  const frame = useMemo(() => ({ chat, assistantName, ask, closePanel }), [chat, assistantName, ask, closePanel]);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("outdoor.sidebar.collapsed") === "true"); } catch { /* Layout preferences are optional. */ }
    const wide = window.matchMedia("(min-width: 1024px)");
    const resized = () => { if (wide.matches) setMobileNavigation(false); };
    wide.addEventListener("change", resized);
    return () => wide.removeEventListener("change", resized);
  }, []);

  useEffect(() => {
    const dialog = cartDialog.current;
    if (panelOpen && dialog && !dialog.open) dialog.showModal();
    if (!panelOpen && dialog?.open) dialog.close();
  }, [panelOpen]);

  useEffect(() => {
    const dialog = navigationDialog.current;
    if (mobileNavigation && dialog && !dialog.open) dialog.showModal();
    if (!mobileNavigation && dialog?.open) dialog.close();
  }, [mobileNavigation]);

  useEffect(() => {
    if (!dock.current) return;
    const observer = new ResizeObserver(([entry]) => {
      workspace.current?.style.setProperty("--composer-height", `${entry.target.getBoundingClientRect().height}px`);
    });
    observer.observe(dock.current);
    return () => observer.disconnect();
  }, []);

  const toggleSidebar = () => {
    setCollapsed((value) => {
      try { localStorage.setItem("outdoor.sidebar.collapsed", String(!value)); } catch { /* Keep working without browser storage. */ }
      return !value;
    });
  };
  const openNavigation = () => { onPanelOpenChange(false); setMobileNavigation(true); };
  const openCart = () => { setMobileNavigation(false); onPanelOpenChange(true); };
  const navigation = (mobile: boolean) => (
    <>
      <div className="sidebar-heading">
        {brand}
        <button type="button" className="workspace-icon-button" autoFocus={mobile} aria-label={mobile ? "关闭历史对话" : "收起侧边栏"} onClick={mobile ? closeNavigation : toggleSidebar}>
          <Icon name={mobile ? "x" : "sidebar"} size={20} />
        </button>
      </div>
      {sidebar(closeNavigation)}
      <div className="sidebar-footer">{sidebarFooter}</div>
    </>
  );

  return (
    <FrameContext.Provider value={frame}>
      <div className="store-workspace">
        <aside aria-label="历史对话导航" className={`conversation-sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>{navigation(false)}</aside>
        <div ref={workspace} className="workspace-main">
          <header className="workspace-header">
            <button type="button" className="workspace-icon-button mobile-navigation-button" aria-label="打开历史对话" aria-expanded={mobileNavigation} onClick={openNavigation}><Icon name="sidebar" size={22} /></button>
            {collapsed ? <button type="button" className="workspace-icon-button desktop-navigation-button" aria-label="展开侧边栏" onClick={toggleSidebar}><Icon name="sidebar" size={22} /></button> : null}
            <div className="workspace-heading"><span>{assistantName}</span><h1 title={conversationTitle}>{conversationTitle}</h1></div>
            {views.length > 1 ? <nav aria-label="页面导航">{views.map((item) => <button type="button" key={item.id} aria-current={item.id === view ? "page" : undefined} onClick={() => onViewChange(item.id)}>{item.label}</button>)}</nav> : null}
            <div className="workspace-header-actions">{headerActions}</div>
          </header>
          {banner}
          <main className="min-h-0 flex-1">{children}</main>
          <div ref={dock} className="composer-dock">
            <Composer send={ask} ready={chat.ready} busy={chat.busy} prefill={composerPrefill} label={`向${assistantName}提问`} placeholder={placeholder} className="conversation-column" />
            <p className="composer-note">装备参数与商品为虚构体验数据，结算不下单或扣款。</p>
          </div>
          <button type="button" data-cart-target className="floating-cart" aria-label={`打开${bag.label}，共 ${bag.count} ${bag.noun}`} aria-haspopup="dialog" aria-expanded={panelOpen} onClick={openCart}>
            <Icon name="cart" size={26} />
            {bag.count > 0 ? <span key={bag.count} className="floating-cart-count ac-pop">{bag.count > 99 ? "99+" : bag.count}</span> : null}
            {bag.extra}
          </button>
        </div>
        <dialog ref={navigationDialog} className="store-dialog navigation-dialog" aria-label="历史对话" onClose={closeNavigation} onClick={(event) => { if (event.target === event.currentTarget) closeNavigation(); }}>
          <aside className="mobile-conversation-sidebar">{navigation(true)}</aside>
        </dialog>
        <dialog ref={cartDialog} className="store-dialog cart-dialog" aria-label={bag.label} onClose={closePanel} onClick={(event) => { if (event.target === event.currentTarget) closePanel(); }}>
          <aside className="cart-drawer">{panel}</aside>
        </dialog>
      </div>
    </FrameContext.Provider>
  );
}
