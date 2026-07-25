"use client";

import { ShieldCheck, Check, X, Loader2, RotateCcw } from "lucide-react";
import type { PendingAction } from "@/hooks/useAgentConfirm";

// The human-in-the-loop confirmation card for a sensitive agent action.
// Shared by the full-page assistant and the floating VoiceOverlay so the
// "confirm before I act" UX is identical everywhere.
export function ActionCard({
  action,
  onConfirm,
  onCancel,
}: {
  action: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const a = action;
  return (
    <div className="flex items-start gap-3 animate-slide-in">
      <div className="w-7 h-7 rounded-full bg-amber-400/20 border border-amber-400/30 flex-none flex items-center justify-center">
        <ShieldCheck size={13} className="text-amber-300" />
      </div>
      <div className="max-w-[85%] sm:max-w-[75%] w-full">
        <div className="rounded-card border border-amber-400/30 bg-amber-400/5 px-4 py-3">
          <p className="text-[11px] font-mono uppercase tracking-wider text-amber-300/80 mb-1">Confirm before I act</p>
          <p className="text-sm text-text-primary font-medium">{a.summary}</p>
          {a.tool === "send_email" && (
            <div className="mt-2 space-y-1 text-xs text-text-secondary bg-background-base/50 rounded-input p-2 border border-border-default">
              <div><span className="text-text-muted">To:</span> {a.args?.to}</div>
              <div><span className="text-text-muted">Subject:</span> {a.args?.subject}</div>
              <div className="whitespace-pre-wrap"><span className="text-text-muted">Body:</span> {a.args?.body}</div>
            </div>
          )}
          {a.status === "pending" && (
            <div className="flex items-center gap-2 mt-3">
              <button onClick={onConfirm} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-success/15 text-success border border-success/30 text-xs font-medium hover:bg-success/25 transition-colors">
                <Check size={13} /> {a.openLabel ?? "Confirm & do it"}
              </button>
              <button onClick={onCancel} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input text-text-muted border border-border-default text-xs hover:text-text-secondary transition-colors">
                <X size={13} /> Cancel
              </button>
            </div>
          )}
          {a.status === "running" && (
            <div className="flex items-center gap-2 mt-3 text-xs text-accent-blue"><Loader2 size={13} className="animate-spin" /> Doing it…</div>
          )}
          {a.status === "done" && (
            <div className="flex items-center gap-2 mt-3 text-xs text-success"><Check size={13} /> {a.result}</div>
          )}
          {a.status === "failed" && (
            <div className="mt-3 space-y-2">
              <div className="flex items-start gap-2 text-xs text-accent-red"><X size={13} className="flex-none mt-0.5" /> <span>Couldn&apos;t do it — {a.result}</span></div>
              {/(connect|not connected|permission|scope|authoriz)/i.test(a.result ?? "") && (
                <div className="flex items-center gap-2">
                  <a href="/api/connect/google"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-accent-blue/15 text-accent-blue border border-accent-blue/30 text-xs font-medium hover:bg-accent-blue/25 transition-colors">
                    <ShieldCheck size={13} /> Connect Google &amp; grant access
                  </a>
                  <button onClick={onConfirm}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input text-text-secondary border border-border-default text-xs hover:text-text-primary transition-colors">
                    <RotateCcw size={12} /> Try again
                  </button>
                </div>
              )}
            </div>
          )}
          {a.status === "canceled" && (
            <div className="flex items-center gap-2 mt-3 text-xs text-text-muted"><X size={13} /> Canceled — nothing was done.</div>
          )}
        </div>
      </div>
    </div>
  );
}
