"use client";

import { useCallback, useEffect, useState } from "react";
import { Workflow, Pause, Play, Trash2, AlertCircle, Loader2, Clock } from "lucide-react";
import { dataUpdate, dataDelete } from "@/lib/dataClient";
import { formatRelativeTime } from "@/lib/utils";

interface Automation {
  id: string;
  name: string;
  action: string;
  fireAt: string;
  recurrence: string | null;
  status: "pending" | "paused";
  lastRun: { channel: string; status: string; at: string } | null;
}

export function AutomationsCard() {
  const [rows, setRows] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/automations");
      if (r.status === 401 || r.status === 501) {
        setRows([]);
        setError("Automations need cloud sync — connect Supabase to see and manage them here.");
        return;
      }
      const d = (await r.json()) as { automations?: Automation[]; error?: string };
      if (d.error) {
        setError(d.error);
        setRows([]);
        return;
      }
      setError(null);
      setRows(d.automations ?? []);
    } catch {
      setError("Couldn't load your automations.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePause(a: Automation) {
    const next = a.status === "paused" ? "pending" : "paused";
    setBusy(a.id);
    setRows((prev) => (prev ?? []).map((r) => (r.id === a.id ? { ...r, status: next } : r)));
    const ok = await dataUpdate("reminders", a.id, { status: next });
    if (!ok) {
      setRows((prev) => (prev ?? []).map((r) => (r.id === a.id ? { ...r, status: a.status } : r)));
      setError("Couldn't save that change.");
    }
    setBusy(null);
  }

  async function remove(a: Automation) {
    if (!confirm(`Delete "${a.name}"? It will stop running and this can't be undone.`)) return;
    setBusy(a.id);
    const ok = await dataDelete("reminders", a.id);
    if (ok) {
      setRows((prev) => (prev ?? []).filter((r) => r.id !== a.id));
    } else {
      setError("Couldn't delete that automation.");
      setBusy(null);
    }
  }

  return (
    <div className="holo-card rounded-card p-5 mt-5">
      <div className="flex items-center gap-2 mb-1">
        <Workflow size={14} className="text-[#4FC3F7]" />
        <span className="hud-label text-[#4FC3F7]">// Automations</span>
      </div>
      <h2 className="font-display text-lg font-semibold text-text-primary">Scheduled automations</h2>
      <p className="text-text-muted text-xs font-mono mt-1 mb-4 tracking-wider">
        Recurring actions the assistant runs on your behalf. Ask it to set one up — e.g. &quot;send me a morning brief every day at 8am&quot;.
      </p>

      {error && (
        <div className="flex items-center gap-2 mb-3 text-xs text-accent-red">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {rows === null ? (
        <p className="text-text-muted text-xs font-mono">Loading…</p>
      ) : rows.length === 0 && !error ? (
        <p className="text-text-muted text-xs font-mono">No automations scheduled yet.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {rows.map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary font-medium truncate">{a.name}</span>
                    {a.status === "paused" && (
                      <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-badge bg-white/5 text-text-muted border border-white/10">
                        Paused
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5 truncate">{a.action}</p>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted mt-1.5">
                    <Clock size={10} />
                    {a.recurrence ? `${a.recurrence} · ` : ""}next {new Date(a.fireAt).toLocaleString()}
                  </div>
                  <div className="text-[10px] font-mono mt-0.5">
                    {a.lastRun ? (
                      <span className={a.lastRun.status === "sent" ? "text-success" : "text-accent-red"}>
                        Last run: {a.lastRun.status === "sent" ? "delivered" : "failed"} via {a.lastRun.channel} · {formatRelativeTime(a.lastRun.at)}
                      </span>
                    ) : (
                      <span className="text-text-muted">Not run yet</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => void togglePause(a)}
                    disabled={busy === a.id}
                    title={a.status === "paused" ? "Resume" : "Pause"}
                    aria-label={`${a.status === "paused" ? "Resume" : "Pause"} ${a.name}`}
                    className="p-1.5 rounded-input text-text-muted hover:text-[#4FC3F7] hover:bg-[#4FC3F7]/10 transition-colors disabled:opacity-50"
                  >
                    {busy === a.id ? <Loader2 size={14} className="animate-spin" /> : a.status === "paused" ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <button
                    onClick={() => void remove(a)}
                    disabled={busy === a.id}
                    title="Delete"
                    aria-label={`Delete ${a.name}`}
                    className="p-1.5 rounded-input text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
