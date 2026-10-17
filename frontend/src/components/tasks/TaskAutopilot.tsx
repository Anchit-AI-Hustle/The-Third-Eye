"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { dataList } from "@/lib/dataClient";
import { runThroughChat, type AutopilotTask } from "@/lib/taskAutopilot";
import type { LocalTask } from "@/hooks/useLocalTasks";

// Headless: works each new task with JARVIS, one at a time, in whichever tab
// claims it first. Old tasks are left alone unless the user asks (Run with
// JARVIS dispatches AUTOPILOT_RUN with the task id).

export const AUTOPILOT_RUN = "te:autopilot-run";
const OFF_KEY = "te_autopilot_off";
const SINCE_KEY = "te_autopilot_since";
const POLL_MS = 60_000;
// Each run is several model calls; spacing them keeps chat inside the free tiers.
const GAP_MS = 30_000;

export function autopilotOff(): boolean {
  try { return localStorage.getItem(OFF_KEY) === "1"; } catch { return false; }
}
export function setAutopilotOff(off: boolean) {
  try { if (off) localStorage.setItem(OFF_KEY, "1"); else localStorage.removeItem(OFF_KEY); } catch { /* noop */ }
}
function since(): string {
  try {
    let s = localStorage.getItem(SINCE_KEY);
    if (!s) { s = new Date().toISOString(); localStorage.setItem(SINCE_KEY, s); }
    return s;
  } catch { return new Date().toISOString(); }
}

const post = async (body: Record<string, unknown>) =>
  (await fetch("/api/tasks/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json().catch(() => ({}));

export function TaskAutopilot() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    let busy = false;
    let last = 0;
    const from = since();

    const work = async (asked?: string) => {
      if (busy || (!asked && (autopilotOff() || Date.now() - last < GAP_MS))) return;
      busy = true;
      try {
        let id = asked;
        if (!id) {
          const r = await dataList<LocalTask>("tasks");
          if (!r.remote) return;
          id = r.rows.find((t) => t.status === "todo" && !t.autopilot_status && t.source_type !== "Autopilot" && t.created_at >= from)?.id;
        }
        if (!id) return;
        if (asked) await post({ taskId: id, action: "reset" });
        const claim = await post({ taskId: id, action: "claim" });
        if (!claim.claimed) return;
        last = Date.now();
        window.dispatchEvent(new CustomEvent("te:tasks-updated"));
        const { run, effects } = await runThroughChat(claim.task as AutopilotTask);
        await post({ taskId: id, action: "finish", run, effects });
        window.dispatchEvent(new CustomEvent("te:tasks-updated"));
      } finally {
        busy = false;
      }
    };

    const onAsk = (e: Event) => { void work((e as CustomEvent<string>).detail); };
    const onChange = () => { void work(); };
    window.addEventListener(AUTOPILOT_RUN, onAsk);
    window.addEventListener("te:tasks-updated", onChange);
    window.addEventListener("te:task-created", onChange);
    window.addEventListener("focus", onChange);
    const t = setInterval(onChange, POLL_MS);
    void work();
    return () => {
      clearInterval(t);
      window.removeEventListener(AUTOPILOT_RUN, onAsk);
      window.removeEventListener("te:tasks-updated", onChange);
      window.removeEventListener("te:task-created", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [status]);

  return null;
}
