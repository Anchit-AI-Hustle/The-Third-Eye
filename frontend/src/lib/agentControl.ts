"use client";

// Agent safety primitives (spec §6/§11): a global kill switch and an
// append-only, local-first audit log of every action the assistant applies.
// Plain module + a window event for reactivity — no provider to thread through
// the tree; any component can read/subscribe.

export interface AgentLogEntry {
  id: string;
  ts: string;                                   // ISO timestamp
  type: string;                                 // e.g. task_create, note_delete
  label: string;                                // human-readable summary
  outcome: "applied" | "blocked" | "failed";   // what actually happened
}

const KILL_KEY = "te_agent_killed";
const LOG_KEY = "te_agent_audit_v1";
export const AGENT_EVENT = "te:agent-control";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AGENT_EVENT));
}

export function isAgentKilled(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(KILL_KEY) === "1"; } catch { return false; }
}

export function setAgentKilled(v: boolean) {
  try { localStorage.setItem(KILL_KEY, v ? "1" : "0"); } catch { /* noop */ }
  emit();
}

export function getAgentLog(): AgentLogEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]"); } catch { return []; }
}

// Append-only from the user's perspective: we only ever unshift, and cap the
// stored history at 500 entries so it can't grow unbounded.
export function logAgentAction(e: Omit<AgentLogEntry, "id" | "ts">) {
  if (typeof window === "undefined") return;
  const entry: AgentLogEntry = { ...e, id: crypto.randomUUID(), ts: new Date().toISOString() };
  try {
    const log = getAgentLog();
    log.unshift(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 500)));
  } catch { /* noop */ }
  emit();
}

export function clearAgentLog() {
  try { localStorage.removeItem(LOG_KEY); } catch { /* noop */ }
  emit();
}

// Human summary for a side-effect the agent is about to apply.
export function describeSideEffect(type: string, data?: Record<string, any>): string {
  const d = data ?? {};
  switch (type) {
    case "task_create": return `Created task “${d.title ?? ""}”`;
    case "task_update": return `Updated a task`;
    case "task_delete": return `Deleted a task`;
    case "note_create": return `Created note “${d.title ?? ""}”`;
    case "note_delete": return `Deleted a note`;
    case "goal_create": return `Created goal “${d.title ?? ""}”`;
    case "goal_update": return `Updated goal progress`;
    case "goal_delete": return `Deleted a goal`;
    case "memory_update": return `Remembered a fact`;
    default: return type;
  }
}
