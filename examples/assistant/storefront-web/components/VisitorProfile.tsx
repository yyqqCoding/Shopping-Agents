"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "web-shared";
import { api } from "@/lib/api";

const AVATARS = [
  { id: "mountain", label: "远山" },
  { id: "camp", label: "营地" },
  { id: "forest", label: "松林" },
  { id: "sunrise", label: "日出" },
] as const;
type AvatarId = typeof AVATARS[number]["id"];
interface Profile { name: string; avatar: AvatarId; }
const DEFAULT_PROFILE: Profile = { name: "山野旅人", avatar: "mountain" };

function readProfile(key: string): Profile {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null") as Partial<Profile> | null;
    if (value && typeof value.name === "string" && value.name.trim() && value.name.length <= 24 && AVATARS.some((avatar) => avatar.id === value.avatar)) {
      return { name: value.name.trim(), avatar: value.avatar as AvatarId };
    }
  } catch { /* Display preferences do not block conversations. */ }
  return DEFAULT_PROFILE;
}

/** One owner shares display preferences between the desktop and mobile footers. */
export function useVisitorProfile(identityReady: boolean) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (!identityReady) return;
    let current = true;
    let storageKey: string | null = null;
    // Session initialization already resolved this cached identity; no new account.
    void api.initialize().then((id) => {
      if (!current) return;
      storageKey = `outdoor.profile:${id}`;
      setProfile(readProfile(storageKey));
      setKey(storageKey);
    }).catch(() => { /* The session owns identity errors and retry. */ });
    const sync = (event: StorageEvent) => {
      if (storageKey && (event.key === storageKey || event.key === null)) setProfile(readProfile(storageKey));
    };
    window.addEventListener("storage", sync);
    return () => { current = false; window.removeEventListener("storage", sync); };
  }, [identityReady]);

  const save = (next: Profile): string | null => {
    if (!key) return "个人资料尚未就绪，请稍后重试。";
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { return "当前浏览器无法保存个人资料，请检查浏览器的存储设置。"; }
    setProfile(next);
    return null;
  };
  return { profile, ready: key !== null, save };
}

function Avatar({ value }: { value: AvatarId }) {
  return (
    <span className="visitor-avatar" data-avatar={value} aria-hidden>
      <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {value === "mountain" ? <><path d="m6 29 11-18 7 11 4-6 7 13H6Z" /><path d="m13 18 4 3 3-3" /><circle cx="29" cy="10" r="3" fill="currentColor" stroke="none" /></> : null}
        {value === "camp" ? <><path d="m7 29 13-19 13 19H7Zm8 0 5-10 5 10M17 7l3 3 3-3M5 32h30" /><path d="M29 10h4m-2-2v4" /></> : null}
        {value === "forest" ? <><path d="m14 8-7 11h4l-6 9h18l-6-9h4L14 8Zm0 20v5m14-20-5 8h3l-4 7h13l-4-7h3l-6-8Zm0 15v5" /></> : null}
        {value === "sunrise" ? <><path d="M12 24a8 8 0 0 1 16 0M6 24h28M10 29h20M15 34h10M20 5v5M6 12l4 4m20 0 4-4M3 20h4m26 0h4" /></> : null}
      </svg>
    </span>
  );
}

type Section = "profile" | "help" | "about";
const TITLES: Record<Section, string> = { profile: "个人资料", help: "使用说明", about: "关于体验" };

export default function VisitorProfile({ profile, ready, save }: ReturnType<typeof useVisitorProfile>) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const nameId = useId();
  const [section, setSection] = useState<Section | null>(null);
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        menu.current.open = false;
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);

  useEffect(() => {
    if (section && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!section && dialog.current?.open) dialog.current.close();
  }, [section]);

  const open = (next: Section) => {
    if (menu.current) menu.current.open = false;
    setDraft(profile);
    setError(null);
    setSection(next);
  };

  return (
    <>
      <details ref={menu} className="visitor-menu">
        <summary ref={trigger} className="visitor-trigger" aria-label={`${profile.name}，个人设置`}>
          <Avatar value={profile.avatar} />
          <span className="visitor-label"><strong title={profile.name}>{profile.name}</strong><span>个人设置</span></span>
          <svg className="visitor-more" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
        </summary>
        <div className="visitor-menu-items">
          <button type="button" disabled={!ready} onClick={() => open("profile")}><Icon name="user" size={18} /><span>个人资料</span><Icon name="chevron-right" size={16} /></button>
          <button type="button" onClick={() => open("help")}><Icon name="message" size={18} /><span>使用说明</span><Icon name="chevron-right" size={16} /></button>
          <button type="button" onClick={() => open("about")}><Icon name="spark" size={18} /><span>关于体验</span><Icon name="chevron-right" size={16} /></button>
        </div>
      </details>
      <dialog ref={dialog} className="store-dialog visitor-dialog" aria-labelledby={titleId}
        onClose={() => { setSection(null); trigger.current?.focus(); }}
        onClick={(event) => { if (event.target === event.currentTarget) setSection(null); }}>
        <div className="visitor-card">
          <header><h2 id={titleId}>{section ? TITLES[section] : "个人设置"}</h2><button type="button" className="workspace-icon-button" aria-label="关闭个人设置" onClick={() => setSection(null)}><Icon name="x" size={20} /></button></header>
          {section === "profile" ? (
            <form onSubmit={(event) => {
              event.preventDefault();
              const name = draft.name.trim();
              if (!name || name.length > 24) { setError("请输入 1 至 24 个字符的昵称。"); return; }
              const message = save({ ...draft, name });
              setError(message);
              if (!message) setSection(null);
            }}>
              <label className="visitor-field-label" htmlFor={nameId}>昵称</label>
              <input id={nameId} className="visitor-name-input" autoFocus required maxLength={24} autoComplete="nickname" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(null); }} />
              <fieldset className="visitor-avatar-picker"><legend>选择头像</legend><div>
                {AVATARS.map((avatar) => <label key={avatar.id}>
                  <input type="radio" className="sr-only" name={`${nameId}-avatar`} value={avatar.id} checked={draft.avatar === avatar.id} onChange={() => setDraft({ ...draft, avatar: avatar.id })} />
                  <span className="visitor-avatar-choice"><Avatar value={avatar.id} /><span>{avatar.label}</span></span>
                </label>)}
              </div></fieldset>
              <p className="visitor-note">头像和昵称仅用于个人展示，保存在当前浏览器。</p>
              {error ? <p className="visitor-error" role="alert">{error}</p> : null}
              <button type="submit" className="visitor-save">保存资料</button>
            </form>
          ) : null}
          {section === "help" ? <div className="visitor-copy">
            <p>从一次出行聊起，把人数、天气、预算和已有装备告诉助手。</p>
            <ul><li><strong>挑选装备</strong><span>按场景与预算，找到适合你的候选。</span></li><li><strong>比较商品</strong><span>看看重量、容量和性能之间的取舍。</span></li><li><strong>整理清单</strong><span>搭配整套装备，将需要的商品加入购物车。</span></li></ul>
            <p>左侧可以新建或切换对话，右下角可以打开购物车。</p>
          </div> : null}
          {section === "about" ? <div className="visitor-copy">
            <div className="visitor-about-mark"><Avatar value="mountain" /><strong>户外装备助手</strong></div>
            <p>一个陪你挑选徒步、露营与轻量出行装备的购物 Agent。通过对话了解需求，检索商品、解释差异，并协助整理出行装备。</p>
            <p>打开即可体验。商品、价格与评价均为虚构演示数据，结算不会创建真实订单或产生扣款。</p>
          </div> : null}
        </div>
      </dialog>
    </>
  );
}
