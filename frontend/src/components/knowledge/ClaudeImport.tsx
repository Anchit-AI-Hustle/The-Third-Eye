"use client";

import { useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { History, Loader2 } from "lucide-react";
import { claudeExportPieces } from "@/lib/claudeExport";

const BATCH = 50;

async function readExport(files: FileList): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const f of Array.from(files)) {
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => /\.json$/i.test(e.name) });
      for (const [name, bytes] of Object.entries(entries)) out[name] = strFromU8(bytes);
    } else {
      out[f.name] = await f.text();
    }
  }
  return out;
}

/**
 * Brings the user's Claude history (chats and projects, from Claude's own data
 * export) into the assistant's memory as background it uses without citing.
 */
export function ClaudeImport() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const all = claudeExportPieces(await readExport(files));
      if (!all.length) { setStatus("No chats or projects found. Choose the .zip from Claude's data export, or its conversations.json / projects.json."); return; }
      let done = 0;
      for (let i = 0; i < all.length; i += BATCH) {
        const res = await fetch("/api/cortex/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pieces: all.slice(i, i + BATCH) }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setStatus(`Stopped after ${done} of ${all.length}: ${err.error ?? `error ${res.status}`}. Importing the same file again continues without duplicates.`);
          return;
        }
        done = Math.min(all.length, i + BATCH);
        setStatus(`Learning… ${done} of ${all.length}`);
      }
      setStatus(`Done. The assistant now knows your Claude history (${all.length} pieces) and uses it without quoting it.`);
    } catch {
      setStatus("Couldn't read that file. Choose the .zip Claude emailed you, or the JSON files inside it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-background-surface border border-border-default rounded-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-input bg-accent-blue/10 text-accent-blue"><History size={16} /></div>
        <div className="min-w-0">
          <h2 className="text-text-primary font-medium text-sm">Import from Claude</h2>
          <p className="text-text-muted text-xs mt-1">
            Teach the assistant everything from your Claude chats and projects. In Claude, open Settings → Privacy →
            Export data, then choose the .zip it emails you. It stays private to your account.
          </p>
        </div>
      </div>
      <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-input border border-accent-blue/40 text-sm font-semibold text-accent-blue hover:bg-accent-blue/10">
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        {busy ? "Importing…" : "Choose Claude export"}
        <input type="file" accept=".zip,.json,application/zip,application/json" multiple className="sr-only" disabled={busy}
          onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
      </label>
      {status && <p role="status" className="text-xs text-text-secondary">{status}</p>}
    </div>
  );
}
