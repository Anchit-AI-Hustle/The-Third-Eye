"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Row { provider: string; status: string; model: string | null; reason: string | null; benchedUntil: string | null; checkedAt: string | null }

const LABEL: Record<string, string> = {
  ok: "Working", unknown: "Not checked yet", rate_limited: "Rate limited", quota: "Daily quota used up", credit: "Out of credit", error: "Error",
};
const NAME: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic (Claude)", gemini: "Google Gemini", "gemini-lite": "Google Gemini Flash-Lite", grok: "xAI Grok", groq: "Groq", cerebras: "Cerebras", openrouter: "OpenRouter", mistral: "Mistral",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function ProvidersCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/providers").then((r) => r.json()).then((j) => setRows(j.providers ?? [])).catch(() => setRows([]));
  }, []);

  async function recheck() {
    setBusy(true); setNote(null);
    const r = await fetch("/api/providers", { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) setRows(j.providers ?? []);
    else setNote(j?.error ?? "Couldn't run the check.");
  }

  const working = rows?.filter((r) => r.status === "ok").length ?? 0;

  return (
    <section className="rounded-card border border-border-default bg-background-surface/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={15} className="text-[#4FC3F7]" />
        <h2 className="font-semibold text-text-primary text-sm flex-1">AI providers</h2>
        <button type="button" onClick={() => void recheck()} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-check now
        </button>
      </div>
      <p className="text-xs text-text-muted mb-3">
        JARVIS skips any provider that is rate limited, out of quota or out of credit, and switches to a model the provider still offers when one is retired.
      </p>
      {rows === null ? (
        <div className="flex items-center gap-2 text-xs text-text-muted"><Loader2 size={12} className="animate-spin" /> Loading…</div>
      ) : (
        <>
          {rows.length > 0 && working === 0 && rows.some((r) => r.status !== "unknown") && (
            <p className="mb-3 text-xs text-accent-red">No provider is answering right now, so JARVIS can&apos;t reply. Add credit or enable billing on one of them.</p>
          )}
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.provider} className="flex items-start gap-3 rounded-input border border-border-default bg-background-base/40 px-3 py-2">
                <span className={cn("mt-1.5 w-2 h-2 rounded-full flex-none",
                  r.status === "ok" ? "bg-success" : r.status === "unknown" ? "bg-text-muted" : r.status === "rate_limited" ? "bg-warning" : "bg-accent-red")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{NAME[r.provider] ?? r.provider} <span className="text-xs text-text-muted">· {LABEL[r.status] ?? r.status}</span></p>
                  <p className="text-[11px] font-mono text-text-muted truncate">
                    {r.model ?? "—"}{r.benchedUntil ? ` · back ${time(r.benchedUntil)}` : ""}{r.checkedAt ? ` · checked ${time(r.checkedAt)}` : ""}
                  </p>
                  {r.reason && <p className="text-[11px] text-text-muted truncate" title={r.reason}>{r.reason}</p>}
                </div>
              </li>
            ))}
            {!rows.length && <li className="text-xs text-text-muted">No AI provider keys are configured on this deployment.</li>}
          </ul>
          {note && <p className="mt-2 text-xs text-warning">{note}</p>}
        </>
      )}
    </section>
  );
}
