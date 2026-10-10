"use client";

import { useEffect, useState } from "react";
import { Mail, Calendar, MessageSquare, Check, AlertCircle, Link2, RefreshCw, Unlink } from "lucide-react";

interface Status {
  connected: boolean;
  scopes?: string[];
  available?: boolean;
  updatedAt?: string | null;
}

function scopeLabels(scopes: string[]): string[] {
  const out = new Set<string>();
  for (const s of scopes) {
    if (s.includes("gmail.send")) out.add("Gmail — send");
    else if (s.includes("gmail")) out.add("Gmail — read");
    if (s.includes("calendar")) out.add("Calendar");
  }
  return [...out];
}

export function ConnectionsCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [github, setGithub] = useState<{ connected: boolean; login?: string | null; configured?: boolean } | null>(null);
  const [banner, setBanner] = useState<
    "connected" | "error" | "disconnected" | "no_scopes" | "pending" | "github_connected" | "github_error" | "github_disconnected" | null
  >(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    // Reflect the result of the OAuth round-trip.
    const q = new URLSearchParams(window.location.search).get("connect");
    if (q === "google_connected") setBanner("connected");
    else if (q === "google_no_scopes") setBanner("no_scopes");
    else if (q === "google_error") setBanner("error");
    else if (q === "google_pending") setBanner("pending");
    else if (q === "github_connected") setBanner("github_connected");
    else if (q === "github_error") setBanner("github_error");
    if (q) window.history.replaceState({}, "", window.location.pathname);

    fetch("/api/connect/google/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
    fetch("/api/connect/github/status")
      .then((r) => r.json())
      .then(setGithub)
      .catch(() => setGithub({ connected: false }));
  }, []);

  const connected = !!status?.connected;
  const labels = scopeLabels(status?.scopes ?? []);

  async function disconnect() {
    if (!confirm("Disconnect Google? The assistant will lose access to your mail and calendar, and the permission is revoked at Google.")) return;
    setDisconnecting(true);
    try {
      const r = await fetch("/api/connect/google", { method: "DELETE" });
      const j = await r.json().catch(() => null);
      setBanner(j?.ok ? "disconnected" : "error");
      if (j?.ok) setStatus({ connected: false, scopes: [] });
    } catch {
      setBanner("error");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="holo-card rounded-card p-5 mt-5">
      <div className="flex items-center gap-2 mb-1">
        <Link2 size={14} className="text-[#4FC3F7]" />
        <span className="hud-label text-[#4FC3F7]">// Connections</span>
      </div>
      <h2 className="font-display text-lg font-semibold text-text-primary">Google account</h2>
      <p className="text-text-muted text-xs font-mono mt-1 mb-4 tracking-wider">
        Connect Gmail &amp; Calendar so the assistant can read/summarise mail, send email, check your schedule, and turn emails into tasks.
      </p>

      {banner === "connected" && (
        <div className="flex items-center gap-2 mb-4 text-xs text-success">
          <Check size={13} /> Google connected successfully.
        </div>
      )}
      {banner === "disconnected" && (
        <div className="flex items-center gap-2 mb-4 text-xs text-success">
          <Check size={13} /> Disconnected. Access was revoked at Google and the stored token deleted.
        </div>
      )}
      {banner === "pending" && (
        <div className="flex items-center gap-2 mb-4 text-xs text-text-muted">
          <AlertCircle size={13} /> Gmail and Calendar access is still in Google&apos;s review for this app — it opens to everyone once approved.
        </div>
      )}
      {banner === "no_scopes" && (
        <div className="flex items-start gap-2 mb-4 text-xs text-warning">
          <AlertCircle size={13} className="mt-px shrink-0" />
          <span>
            Nothing was connected — none of the Gmail or Calendar boxes were ticked on
            Google&apos;s screen. Any access you had already granted is untouched. Try again and
            allow at least one.
          </span>
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

      <div className="flex flex-wrap items-center gap-2">
        {status?.available === false && !connected ? (
          <span className="text-xs text-text-muted">
            Gmail and Calendar access is in Google&apos;s review and opens to everyone once it&apos;s approved.
          </span>
        ) : (
        <a
          href="/api/connect/google"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-[#4FC3F7] text-sm font-medium hover:bg-[#4FC3F7]/20 transition-colors"
        >
          {connected ? <><RefreshCw size={14} /> Reconnect / update permissions</> : <><Link2 size={14} /> Connect Google</>}
        </a>
        )}
        {connected && (
          <button
            type="button"
            onClick={disconnect}
            disabled={disconnecting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-accent-red/10 border border-accent-red/30 text-accent-red text-sm font-medium hover:bg-accent-red/20 transition-colors disabled:opacity-50"
          >
            <Unlink size={14} /> {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
      </div>

      <p className="text-text-muted text-[11px] font-mono mt-3 leading-relaxed">
        Sign-in does not grant mail. Connect here when you want the assistant to read or send it.
        While Google's review of those permissions is open, only listed accounts can start this step.
        Disconnecting revokes the permission at Google and deletes the token stored here.
      </p>

      <div className="mt-6 pt-5 border-t border-border-default">
        <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
          <Link2 size={16} /> GitHub
        </h2>
        <p className="text-text-muted text-xs font-mono mt-1 mb-4 tracking-wider">
          Connect GitHub so the assistant can read your repositories, issues, pull requests and code.
        </p>
        {banner === "github_connected" && (
          <div className="flex items-center gap-2 mb-3 text-xs text-success"><Check size={13} /> GitHub connected{github?.login ? ` as ${github.login}` : ""}.</div>
        )}
        {banner === "github_disconnected" && (
          <div className="flex items-center gap-2 mb-3 text-xs text-success"><Check size={13} /> GitHub disconnected.</div>
        )}
        {banner === "github_error" && (
          <div className="flex items-center gap-2 mb-3 text-xs text-accent-red"><AlertCircle size={13} /> Couldn&apos;t connect GitHub.</div>
        )}
        <div className="flex items-center gap-3 mb-4">
          {github?.connected ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-success"><Check size={13} /> Connected{github.login ? ` · ${github.login}` : ""}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-text-muted"><AlertCircle size={13} /> Not connected</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {github?.configured === false ? (
            <p className="text-xs text-text-muted font-mono">GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set on this deployment.</p>
          ) : (
            <a href="/api/connect/github" className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-[#4FC3F7] text-sm font-medium hover:bg-[#4FC3F7]/20 transition-colors">
              <Link2 size={14} /> {github?.connected ? "Reconnect GitHub" : "Connect GitHub"}
            </a>
          )}
          {github?.connected && (
            <button
              type="button"
              onClick={async () => {
                const r = await fetch("/api/connect/github", { method: "DELETE" });
                const j = await r.json().catch(() => null);
                if (j?.ok) { setGithub({ connected: false, configured: github?.configured }); setBanner("github_disconnected"); }
                else setBanner("github_error");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-accent-red/10 border border-accent-red/30 text-accent-red text-sm font-medium hover:bg-accent-red/20 transition-colors"
            >
              <Unlink size={14} /> Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
