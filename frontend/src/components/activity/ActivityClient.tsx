"use client";

import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, ShieldAlert, Check, X, AlertTriangle, Download, Trash2, Power } from "lucide-react";
import {
  AGENT_EVENT, getAgentLog, isAgentKilled, setAgentKilled, clearAgentLog,
  type AgentLogEntry,
} from "@/lib/agentControl";

export function ActivityClient() {
  const [killed, setKilled] = useState(false);
  const [log, setLog] = useState<AgentLogEntry[]>([]);

  const refresh = useCallback(() => { setKilled(isAgentKilled()); setLog(getAgentLog()); }, []);

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener(AGENT_EVENT, on);
    // Reflect changes made in other tabs too.
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(AGENT_EVENT, on); window.removeEventListener("storage", on); };
  }, [refresh]);

  function exportLog() {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `third-eye-agent-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  const outcomeMeta = (o: AgentLogEntry["outcome"]) =>
    o === "applied" ? { icon: <Check size={13} />, cls: "text-emerald-400" }
    : o === "blocked" ? { icon: <X size={13} />, cls: "text-rose-400" }
    : { icon: <AlertTriangle size={13} />, cls: "text-amber-400" };

  return (
    <div className="space-y-6">
      {/* Kill switch */}
      <div className={`rounded-card border p-5 ${killed ? "border-rose-500/50 bg-rose-500/10" : "border-border-default bg-background-surface/40"}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {killed ? <ShieldAlert size={22} className="text-rose-400 flex-none" /> : <ShieldCheck size={22} className="text-emerald-400 flex-none" />}
            <div>
              <div className="text-sm font-semibold text-text-primary">
                {killed ? "Agent halted" : "Agent active"}
              </div>
              <div className="text-xs text-text-muted">
                {killed
                  ? "The kill switch is engaged — the assistant will apply no actions. Requests are logged as blocked."
                  : "The assistant can apply actions (create/update/delete tasks, notes, goals) with your approval."}
              </div>
            </div>
          </div>
          <button
            onClick={() => setAgentKilled(!killed)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold transition-colors ${
              killed
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25"
                : "bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25"
            }`}
          >
            <Power size={15} /> {killed ? "Resume agent" : "Kill switch"}
          </button>
        </div>
      </div>

      {/* Audit log */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="hud-label text-text-muted">Audit log · append-only</div>
          <div className="flex items-center gap-2">
            <button onClick={exportLog} disabled={!log.length}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-[#4FC3F7] disabled:opacity-40">
              <Download size={12} /> Export
            </button>
            <button onClick={() => { if (confirm("Clear the local audit log? This cannot be undone.")) clearAgentLog(); }}
              disabled={!log.length}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-rose-400 disabled:opacity-40">
              <Trash2 size={12} /> Clear
            </button>
          </div>
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">
            No activity yet. Assistant actions, generations (Studio / Music / Kolab), voice captures and system events all appear here — and anything blocked by the kill switch.
          </p>
        ) : (
          <div className="divide-y divide-border-default">
            {log.map((e) => {
              const m = outcomeMeta(e.outcome);
              return (
                <div key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className={`flex-none ${m.cls}`}>{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{e.label}</div>
                    <div className="text-[11px] text-text-muted font-mono">{e.type} · {e.outcome}</div>
                  </div>
                  <span className="text-[11px] text-text-muted font-mono flex-none">{new Date(e.ts).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-text-muted">
        Local-first &amp; private: this log lives in your browser and is never sent anywhere. Export it any time.
      </p>
    </div>
  );
}
