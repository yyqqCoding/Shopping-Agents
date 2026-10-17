"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon, useSession } from "web-shared";
import { api } from "@/lib/api";
import OutdoorMark from "@/components/OutdoorMark";
import "./memory.css";

interface MemoryFile { filename: string; name: string; description: string; type: string; mtime: number; }
interface Document { filename: string; content: string; revision: string | null; missing?: boolean; truncated?: boolean; }
interface Settings { enabled: boolean; extract_enabled: boolean; prefetch_enabled: boolean; dream_enabled: boolean; daily_mode: boolean; extraction_every: number; dream_min_hours: number; dream_min_sessions: number; namespace: string; timezone: string; agents: Record<string, string>; }
interface Dream { id: string; status: string; phase: string; text?: string; error?: string; files: string[]; turns: { text: string; tool_count: number }[]; }
interface Activity { id: string; at: number; verb: string; files: { filename?: string; namespace?: string }[]; }
interface MemoryState { files: MemoryFile[]; settings: Settings; tasks: Dream[]; activity: Activity[]; snapshot?: { action: string; snapshot_timestamp?: string } | null; }
interface Proposal { id: string; filename: string; namespace: string; action: string; content: string; before: string; reason: string; }
interface Review { id: string; report: string; proposals: Proposal[]; }

const labels: Record<string, string> = { user: "个人信息", feedback: "偏好与反馈", project: "长期目标", reference: "参考资料" };
const taskLabels: Record<string, string> = { running: "正在整理", completed: "整理完成", failed: "整理失败", cancelled: "已取消" };

export default function MemoryPage() {
  const session = useSession(api);
  const [state, setState] = useState<MemoryState | null>(null);
  const [namespace, setNamespace] = useState("auto");
  const [document, setDocument] = useState<Document | null>(null);
  const [draft, setDraft] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const [agent, setAgent] = useState("shopping");
  const [scope, setScope] = useState("user");
  const [frequency, setFrequency] = useState<Partial<Settings>>({});
  const [snapshot, setSnapshot] = useState<{ action: string; snapshot_timestamp?: string } | null>(null);

  const refresh = useCallback(async () => {
    const data = await api.requestOrThrow<MemoryState>(`/memory/state?namespace=${encodeURIComponent(namespace)}`);
    setState(data);
    setSnapshot(data.snapshot || null);
  }, [namespace]);

  useEffect(() => {
    if (!session.sessionId) return;
    let active = true;
    void refresh().catch((value: Error) => { if (active) setError(value.message); });
    const timer = window.setInterval(() => {
      if (globalThis.document.visibilityState === "visible") void refresh().catch(() => {});
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session.sessionId, refresh]);

  async function action(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (value) { setError(value instanceof Error ? value.message : "操作未完成，请重试。"); }
    finally { setBusy(false); }
  }

  async function openFile(name: string, ns = namespace) {
    if (document && draft !== document.content && !window.confirm("当前修改尚未保存，是否放弃修改并打开另一份记忆？")) return;
    const value = await api.requestOrThrow<Document>(`/memory/file?filename=${encodeURIComponent(name)}&namespace=${encodeURIComponent(ns)}`);
    if (ns !== namespace) setNamespace(ns);
    setDocument(value); setDraft(value.content); setDeletePending(false);
  }

  async function saveSettings(changes: Partial<Settings>) {
    const value = await api.requestOrThrow<Settings>("/memory/settings", { method: "PATCH", body: JSON.stringify(changes) });
    setState((previous) => previous ? { ...previous, settings: value } : previous);
    setNotice("设置已保存。");
  }

  async function snapshotAction(value: string) {
    const result = await api.requestOrThrow<{ action: string; snapshot_timestamp?: string }>("/memory/snapshot", { method: "POST", body: JSON.stringify({ namespace, action: value }) });
    setSnapshot(result); await refresh();
    setNotice(value === "check" ? "已检查快照。" : "快照操作已完成。");
  }

  return <div className="memory-page">
    <header className="memory-header">
      <Link href="/" className="outdoor-wordmark"><OutdoorMark className="outdoor-mark" /><span>户外装备助手</span></Link>
      <Link href="/chat" className="memory-back"><Icon name="message" size={18} />返回对话</Link>
    </header>
    <main id="main-content" className="memory-main">
      <div className="memory-title"><div><h1>记忆</h1><p>查看助手记住的内容，修改偏好，或整理已有记忆。</p></div>
        <button type="button" disabled={busy || !session.sessionId} onClick={() => void action(refresh)}>刷新</button>
      </div>
      {session.error || error ? <p className="memory-error" role="alert">{session.error || error}</p> : null}
      {notice ? <p className="memory-notice" role="status">{notice}</p> : null}
      {!state ? <p role="status">正在读取记忆…</p> : <>
        <details className="memory-settings"><summary>记忆设置</summary><section aria-label="记忆设置">
          {([
            ["enabled", "记忆", "允许助手在对话之间保存和使用记忆。"],
            ["extract_enabled", "后台补充", "回复结束后整理新增信息。"],
            ["prefetch_enabled", "自动查找", "根据当前问题挑选相关记忆。"],
            ["dream_enabled", "自动整理", "定期合并重复内容并更新索引。"],
            ["daily_mode", "日记模式", "按日追加记录，跨日检查并整理。"],
          ] as const).map(([key, title, description]) => <label key={key} className="memory-setting"><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={state.settings[key]} disabled={busy} onChange={(event) => void action(() => saveSettings({ [key]: event.target.checked }))} /></label>)}
          <details><summary>整理频率</summary><div className="memory-frequency">
            <label>每隔几个回合补充<input type="number" min="1" max="100" value={frequency.extraction_every ?? state.settings.extraction_every} onChange={(event) => setFrequency({ ...frequency, extraction_every: Number(event.target.value) })} /></label>
            <label>自动整理间隔（小时）<input type="number" min="1" value={frequency.dream_min_hours ?? state.settings.dream_min_hours} onChange={(event) => setFrequency({ ...frequency, dream_min_hours: Number(event.target.value) })} /></label>
            <label>至少经过几段其他对话<input type="number" min="1" value={frequency.dream_min_sessions ?? state.settings.dream_min_sessions} onChange={(event) => setFrequency({ ...frequency, dream_min_sessions: Number(event.target.value) })} /></label>
            <button type="button" disabled={busy} onClick={() => void action(() => saveSettings(frequency))}>保存频率</button>
          </div></details>
        </section></details>
        <div className="memory-scope"><label>查看范围<select value={namespace === "auto" || namespace === "instructions" ? namespace : "agent"} disabled={busy} onChange={(event) => { setNamespace(event.target.value === "agent" ? `agent/${scope}/${agent}` : event.target.value); setDocument(null); setSnapshot(null); }}><option value="auto">个人记忆</option><option value="instructions">个人指导</option><option value="agent">独立助手记忆</option></select></label>
          {namespace.startsWith("agent/") ? <><label>作用域<select value={scope} onChange={(event) => { setScope(event.target.value); setNamespace(`agent/${event.target.value}/${agent}`); setDocument(null); }}><option value="user">跨项目</option><option value="project">当前项目</option><option value="local">本机项目</option></select></label><label>助手名称<input value={agent} maxLength={64} pattern="[a-zA-Z0-9_-]+" onChange={(event) => setAgent(event.target.value)} onBlur={() => { if (/^[a-zA-Z0-9_-]{1,64}$/.test(agent)) { setNamespace(`agent/${scope}/${agent}`); setDocument(null); } }} /></label><button type="button" disabled={busy} onClick={() => void action(() => snapshotAction("check"))}>检查快照</button><button type="button" disabled={busy} onClick={() => void action(() => snapshotAction("save"))}>保存快照</button></> : null}
          {namespace !== "instructions" ? <button type="button" disabled={busy || state.settings.namespace === namespace} onClick={() => void action(() => saveSettings({ namespace, ...(namespace.startsWith("agent/") ? { agents: { ...state.settings.agents, [agent]: scope } } : {}) }))}>{state.settings.namespace === namespace ? "当前对话使用此范围" : "对话使用此范围"}</button> : null}
        </div>
        {snapshot?.action === "initialize" || snapshot?.action === "prompt-update" ? <div className="memory-snapshot"><p>{snapshot.action === "initialize" ? "有可用于初始化的快照。" : "发现更新的快照，本地记忆已保留。"}</p><button type="button" disabled={busy} onClick={() => void action(() => snapshotAction(snapshot.action === "initialize" ? "initialize" : "replace"))}>采用快照</button><button type="button" disabled={busy} onClick={() => void action(() => snapshotAction("keep"))}>保留本地</button></div> : null}
        <section className="memory-workbench" aria-label="记忆文件">
          <aside className="memory-files"><h2>{namespace === "instructions" ? "个人指导" : "记忆内容"}</h2>
            <button type="button" className={document?.filename === (namespace === "instructions" ? "CLAUDE.local.md" : "MEMORY.md") ? "is-selected" : ""} onClick={() => void action(() => openFile(namespace === "instructions" ? "CLAUDE.local.md" : "MEMORY.md"))}>{namespace === "instructions" ? "个人指导" : "记忆索引"}</button>
            {state.files.map((file) => <button type="button" key={file.filename} className={document?.filename === file.filename ? "is-selected" : ""} onClick={() => void action(() => openFile(file.filename))}><strong>{file.name || file.filename}</strong><span>{file.description || file.filename}</span><small>{labels[file.type] || file.type}</small></button>)}
            {!state.files.length ? <p className="memory-empty">还没有主题记忆。聊天时可告诉助手需要记住的偏好。</p> : null}
            {namespace !== "instructions" ? <form onSubmit={(event) => { event.preventDefault(); void action(async () => { await openFile(filename.endsWith(".md") ? filename : `${filename}.md`); }); }}><label htmlFor="memory-new-file">新建主题</label><input id="memory-new-file" required placeholder="主题文件名.md" value={filename} onChange={(event) => setFilename(event.target.value)} /><button type="submit" disabled={busy || !filename.trim()}>新建</button></form> : null}
          </aside>
          <div className="memory-editor">{document ? <><div className="memory-editor-heading"><h2>{document.filename}</h2><span>{draft !== document.content ? "尚未保存" : document.missing ? "新文件" : "已保存"}</span></div>
            {document.missing && document.filename !== "MEMORY.md" && namespace !== "instructions" ? <p>主题文件需包含 name、description、type 的 YAML 头部；类型为 user、feedback、project 或 reference。</p> : null}
            <label className="sr-only" htmlFor="memory-content">记忆内容</label><textarea id="memory-content" spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} />
            {document.truncated ? <p role="alert">文件内容未完整读取，请先缩小文件后编辑。</p> : null}
            <div className="memory-editor-actions"><button type="button" className="memory-primary" disabled={busy || document.truncated || draft === document.content} onClick={() => void action(async () => { const saved = await api.requestOrThrow<{ revision: string }>("/memory/file", { method: "PUT", body: JSON.stringify({ filename: document.filename, content: draft, revision: document.revision, namespace }) }); setDocument({ ...document, content: draft, revision: saved.revision, missing: false }); await refresh(); setNotice("记忆已保存。"); })}>保存内容</button>
              {!document.missing ? <button type="button" disabled={busy} onClick={() => setDeletePending(!deletePending)}>删除这份记忆</button> : null}</div>
            {deletePending ? <div className="memory-delete"><p>删除后，助手将不再从这份文件读取记忆。</p><button type="button" disabled={busy} onClick={() => void action(async () => { await api.requestOrThrow(`/memory/file?filename=${encodeURIComponent(document.filename)}&namespace=${encodeURIComponent(namespace)}`, { method: "DELETE" }); setDocument(null); setDraft(""); setDeletePending(false); await refresh(); setNotice("记忆已删除。"); })}>确认删除</button><button type="button" onClick={() => setDeletePending(false)}>取消</button></div> : null}
          </> : <div className="memory-editor-empty"><Icon name="message" size={28} /><h2>选择一份记忆</h2><p>查看内容后，可以直接编辑或删除。修改会用于之后的对话。</p></div>}</div>
        </section>
        <section className="memory-maintenance"><div><h2>整理与审阅</h2><p>整理会更新记忆；审阅先提出建议，选中批准后才应用。</p></div><div className="memory-toolbar"><button type="button" disabled={busy || !state.settings.enabled} onClick={() => void action(async () => { await api.requestOrThrow("/memory/dream", { method: "POST" }); await refresh(); setNotice("整理已开始，可在下方查看或取消。"); })}>开始整理</button><button type="button" disabled={busy} onClick={() => void action(async () => { setReview(await api.requestOrThrow<Review>("/memory/review", { method: "POST", signal: AbortSignal.timeout(180000) }, 180000)); setApproved([]); })}>{busy ? "正在处理…" : "审阅记忆"}</button><button type="button" disabled={busy} onClick={() => void action(async () => { await openFile("CLAUDE.local.md", "instructions"); })}>编辑个人指导</button></div>
          {review ? <div className="memory-review"><h3>审阅建议</h3><pre>{review.report || "具体变更如下，请逐项检查。"}</pre>{review.proposals.map((proposal) => <article key={proposal.id}><h4>{proposal.action === "delete" ? "删除" : "更新"}：{proposal.filename}</h4><p>{proposal.reason}</p><details><summary>查看变更前后</summary><h5>当前内容</h5><pre>{proposal.before || "空文件"}</pre><h5>建议内容</h5><pre>{proposal.content || "删除文件"}</pre></details><button type="button" disabled={busy || approved.includes(proposal.id)} onClick={() => void action(async () => { await api.requestOrThrow(`/memory/review/${review.id}/apply`, { method: "POST", body: JSON.stringify({ proposal_ids: [proposal.id] }) }); setApproved((old) => [...old, proposal.id]); await refresh(); setNotice("选中的建议已应用。"); })}>{approved.includes(proposal.id) ? "已应用" : "批准这项变更"}</button></article>)}</div> : null}
          {state.tasks.map((task) => <article className="memory-task" key={task.id}><div><h3>{taskLabels[task.status] || task.status}</h3>{task.status === "running" ? <button type="button" onClick={() => void action(async () => { await api.requestOrThrow(`/memory/tasks/${task.id}`, { method: "DELETE" }); await refresh(); })}>取消整理</button> : null}</div><p>{task.phase === "updating" ? "正在更新记忆文件" : "检查已有记忆"}</p>{task.files.length ? <p>涉及文件：{task.files.join("、")}</p> : null}{task.error ? <p className="memory-error">{task.error}</p> : null}<details><summary>查看整理过程</summary>{task.turns.map((turn, i) => <pre key={i}>{turn.text}{turn.tool_count ? `\n处理 ${turn.tool_count} 项操作` : ""}</pre>)}{task.text ? <pre>{task.text}</pre> : null}</details></article>)}
        </section>
        <section className="memory-activity"><h2>最近更新</h2>{!state.activity.length ? <p>保存、编辑或整理记忆后，记录会显示在这里。</p> : state.activity.slice().reverse().map((activity) => <div key={activity.id}><time dateTime={new Date(activity.at * 1000).toISOString()}>{new Date(activity.at * 1000).toLocaleString("zh-CN")}</time><span>{({ saved: "已保存", edited: "已编辑", improved: "已整理", deleted: "已删除" } as Record<string, string>)[activity.verb] || "已更新"}</span>{activity.files.map((file, i) => file.filename ? <button type="button" key={i} onClick={() => void action(() => openFile(file.filename!, file.namespace || "auto"))}>{file.filename}</button> : <span key={i}>全部记忆</span>)}</div>)}</section>
      </>}
    </main>
  </div>;
}
