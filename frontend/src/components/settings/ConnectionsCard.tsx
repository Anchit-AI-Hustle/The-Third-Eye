"use client";

import { useEffect, useState } from "react";
import { Mail, Calendar, MessageSquare, Check, AlertCircle, Link2, RefreshCw } from "lucide-react";

interface Status {
  connected: boolean;
  scopes?: string[];
  updatedAt?: string | null;
}

function scopeLabels(scopes: string[]): string[] {
  const out = new Set<string>();
  for (const s of scopes) {
    if (s.includes("gmail.send")) out.add("Gmail — send");
    else if (s.includes("gmail")) out.add("Gmail — read");
    if (s.includes("calendar")) out.add("Calendar");
    if (s.includes("chat")) out.add("Chat");
  }
  return [...out];
}

export function ConnectionsCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [banner, setBanner] = useState<"connected" | "error" | null>(null);

  useEffect(() => {
    // Reflect the result of the OAuth round-trip (?connect=google_connected|google_error).
    const q = new URLSearchParams(window.location.search).get("connect");
    if (q === "google_connected") setBanner("connected");
    else if (q === "google_error") setBanner("error");
    if (q) window.history.replaceState({}, "", window.location.pathname);

    fetch("/api/connect/google/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  const connected = !!status?.connected;
  const labels = scopeLabels(status?.scopes ?? []);

  return (
    <div className="holo-card rounded-card p-5 mt-5">
      <div className="flex items-center gap-2 mb-1">
        <Link2 size={14} className="text-[#4FC3F7]" />
        <span className="hud-label text-[#4FC3F7]">// Connections</span>
      </div>
      <h2 className="font-display text-lg font-semibold text-text-primary">Google account</h2>
      <p className="text-text-muted text-xs font-mono mt-1 mb-4 tracking-wider">
        Connect Gmail, Calendar &amp; Chat so the assistant can read/summarise mail, send email, and turn messages into tasks.
      </p>

      {banner === "connected" && (
        <div className="flex items-center gap-2 mb-4 text-xs text-success">
          <Check size={13} /> Google connected successfully.
        </div>
      )}
      {banner === "error" && (
        <div className="flex items-center gap-2 mb-4 text-xs text-accent-red">
          <AlertCircle size={13} /> Couldn&apos;t connect — the sign-in was cancelled or the app isn&apos;t authorised for these scopes yet.
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-success">
            <Check size={13} /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-text-muted">
            <AlertCircle size={13} /> Not connected
          </span>
        )}
        {connected && labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <span key={l} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-badge bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/20">
                {l.startsWith("Gmail") ? <Mail size={9} /> : l === "Calendar" ? <Calendar size={9} /> : <MessageSquare size={9} />}
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      <a
        href="/api/connect/google"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-[#4FC3F7] text-sm font-medium hover:bg-[#4FC3F7]/20 transition-colors"
      >
        {connected ? <><RefreshCw size={14} /> Reconnect / update permissions</> : <><Link2 size={14} /> Connect Google</>}
      </a>

      <p className="text-text-muted text-[11px] font-mono mt-3 leading-relaxed">
        You&apos;ll be sent to Google to approve access. If the app isn&apos;t verified yet, you must be added as a Test User on its OAuth consent screen.
      </p>
    </div>
  );
}
