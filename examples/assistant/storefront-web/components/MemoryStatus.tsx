"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function MemoryStatus({ ready, completed }: { ready: boolean; completed: number }) {
  const [label, setLabel] = useState("记忆");
  useEffect(() => {
    if (!ready) return;
    let current = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const value = await api.get<{ tasks: { status: string }[]; activity: { at: number; files: unknown[] }[] }>("/memory/tasks?summary=true");
      if (!value || !current) return;
      if (value.tasks.some((task) => task.status === "running")) setLabel("正在整理记忆");
      else if (value.activity.some((item) => Date.now() / 1000 - item.at < 120)) setLabel("记忆已更新");
      else setLabel("记忆");
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 8000);
    return () => { current = false; window.clearInterval(interval); };
  }, [ready, completed]);
  return <Link href="/memory" className="workspace-catalog-link" aria-live="polite">{label}</Link>;
}
