"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { dataList } from "@/lib/dataClient";
import { runThroughChat, STALE_MS, type AutopilotTask } from "@/lib/taskAutopilot";
import { activeAgent } from "@/hooks/useAgentProfile";
import type { LocalTask } from "@/hooks/useLocalTasks";

// Headless: every open task in the tracker is worked by the agent the user has
// selected, each in its own independent run (its own conversation), a few at a
// time. A task is claimed on the server first, so two tabs never work the same
// one. Run with JARVIS dispatches AUTOPILOT_RUN to rerun a task on demand.

export const AUTOPILOT_RUN = "te:autopilot-run";
const OFF_KEY = "te_autopilot_off";
const POLL_MS = 60_000;
// Each run is several model calls; a few at once keeps chat inside the free tiers.
const MAX_PARALLEL = 3;

export function autopilotOff(): boolean {
  try { return localStorage.getItem(OFF_KEY) === "1"; } catch { return false; }
}
export function setAutopilotOff(off: boolean) {
  try { if (off) localStorage.setItem(OFF_KEY, "1"); else localStorage.removeItem(OFF_KEY); } catch { /* noop */ }
}

const post = async (body: Record<string, unknown>) =>
  (await fetch("/api/tasks/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json().catch(() => ({}));

const stale = (t: LocalTask) => t.autopilot_status === "running" && Date.now() - new Date(t.autopilot_at ?? 0).getTime() > STALE_MS;

export function TaskAutopilot() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    const running = new Set<string>();
    // Worked once in this tab: not again unless asked, even if its outcome
    // failed to save, so a write error can't loop the same task.
    const attempted = new Set<string>();
    let scanning = false;

    const runOne = async (id: string, rerun = false) => {
      if (running.has(id) || (!rerun && attempted.has(id))) return;
      running.add(id);
      attempted.add(id);
      try {
        if (rerun) await post({ taskId: id, action: "reset" });
        const claim = await post({ taskId: id, action: "claim" });
        if (!claim.claimed) return;
        window.dispatchEvent(new CustomEvent("te:tasks-updated"));
        const agent = activeAgent();
        const { run, effects } = await runThroughChat(claim.task as AutopilotTask, agent);
        await post({ taskId: id, action: "finish", run, effects, agentName: agent.name });
        window.dispatchEvent(new CustomEvent("te:tasks-updated"));
      } finally {
        running.delete(id);
      }
    };

    const scan = async () => {
      if (scanning || autopilotOff() || running.size >= MAX_PARALLEL) return;
      scanning = true;
      try {
        const r = await dataList<LocalTask>("tasks");
        if (!r.remote) return;
        const open = r.rows.filter((t) => t.status === "todo" && (!t.autopilot_status || stale(t)) && t.source_type !== "Autopilot" && !running.has(t.id) && !attempted.has(t.id));
        for (const t of open.slice(0, MAX_PARALLEL - running.size)) void runOne(t.id);
      } finally {
        scanning = false;
      }
    };

    const onAsk = (e: Event) => { void runOne((e as CustomEvent<string>).detail, true); };
    const onChange = () => { void scan(); };
    window.addEventListener(AUTOPILOT_RUN, onAsk);
    window.addEventListener("te:tasks-updated", onChange);
    window.addEventListener("te:task-created", onChange);
    window.addEventListener("focus", onChange);
    const t = setInterval(onChange, POLL_MS);
    void scan();
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
