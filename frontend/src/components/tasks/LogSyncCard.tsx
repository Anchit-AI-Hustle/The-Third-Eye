"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { MonitorSmartphone, Sparkles, RefreshCw } from "lucide-react";
import { deviceLabel, flushDeviceLogs } from "./DeviceLogBridge";
import { cn } from "@/lib/utils";

// Status surface for AI Log Sync: shows that this device's activity is being
// tracked, how many events await summarization, the last AI summary, and an
// on-demand "Sync now".

interface SyncStatus {
  pending: number;
  lastSummary: { text: string; at?: string } | null;
  configured: boolean;
}

export function LogSyncCard() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ingest/logs");
      if (res.ok) setStatus(await res.json());
    } catch { /* transient */ }
  }, []);

  useEffect(() => {
    refresh();
    const onUpdated = () => refresh();
    window.addEventListener("te:tasks-updated", onUpdated);
    return () => window.removeEventListener("te:tasks-updated", onUpdated);
  }, [refresh]);

  async function syncNow() {
    setSyncing(true);
    setNote(null);
    try {
      await flushDeviceLogs(session?.user?.email); // ship this device's buffered events first
      const res = await fetch("/api/ingest/logs", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (d.skipped === "cooldown") setNote("Synced recently — try again in a few minutes.");
      else if (d.skipped === "not enough logs") setNote("Not enough new activity to summarize yet.");
      else if (d.changed) {
        setNote(`Tracker updated: ${d.inserted + d.merged} task(s) added/merged, ${d.updated} progressed.`);
        window.dispatchEvent(new CustomEvent("te:tasks-updated"));
      } else setNote("Activity summarized — no tracker changes needed.");
    } catch {
      setNote("Sync failed — will retry in the background.");
    }
    setSyncing(false);
    refresh();
  }

  if (status && !status.configured) return null;

  return (
    <div className="rounded-card border border-border-default bg-background-surface/30 px-4 sm:px-5 py-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none bg-[#A78BFA]/10 text-[#A78BFA]">
          <MonitorSmartphone size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary text-sm">AI Log Sync</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-success/40 text-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> tracking {deviceLabel()}
            </span>
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            Activity on every device you use the app on is logged and folded into this tracker by AI
            {status ? ` · ${status.pending} event(s) pending` : ""}
          </div>
        </div>
        <button
          onClick={syncNow}
          disabled={syncing}
          className="flex-none flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default bg-background-surface text-text-secondary hover:text-text-primary hover:border-border-hover text-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={cn(syncing && "animate-spin")} /> Sync now
        </button>
      </div>
      {note && <p className="text-xs text-text-muted mt-3">{note}</p>}
      {status?.lastSummary && (
        <div className="mt-3 flex items-start gap-2 rounded-input border border-border-default bg-background-elevated/40 px-3 py-2.5">
          <Sparkles size={13} className="text-[#A78BFA] flex-none mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs text-text-secondary leading-relaxed">{status.lastSummary.text}</p>
            {status.lastSummary.at && (
              <p className="text-[10px] font-mono text-text-muted mt-1">
                last summary · {new Date(status.lastSummary.at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
