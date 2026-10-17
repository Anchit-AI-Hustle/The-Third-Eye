"use client";

import { signOut } from "next-auth/react";
import { signOutAndClear } from "@/lib/signOutClean";
import { User, Shield, Cpu, LogOut, ExternalLink, Activity, CheckCircle2, XCircle, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSystemHealth } from "@/hooks/useSystemHealth";

interface Props {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
}

interface ServiceStatus {
  ai: boolean;
  openai: boolean;
  database: boolean;
  google_oauth: boolean;
  serper: boolean;
}

export function SettingsClient({ user }: Props) {
  const health = useSystemHealth();
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  // Right to erasure: wipe server-side data (all rows keyed to this account),
  // then clear every on-device store, then sign out.
  async function deleteAccount() {
    setDeleting(true); setDelError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      // On-device: localStorage, sessionStorage, and the Life Log audio DB.
      try { localStorage.clear(); } catch { /* noop */ }
      try { sessionStorage.clear(); } catch { /* noop */ }
      try { indexedDB.deleteDatabase("te_lifelog"); } catch { /* noop */ }
      await signOut({ callbackUrl: "/auth/signin" });
    } catch (e) {
      setDelError(e instanceof Error ? e.message : "Couldn't delete the account. Try again.");
      setDeleting(false);
    }
  }

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => { setStatus(d); setStatusLoading(false); })
      .catch(() => setStatusLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {/* Profile */}
      <Section icon={<User size={15} />} title="Profile">
        <div className="flex items-center gap-4 p-5">
          {user?.image ? (
            <img src={user.image} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-border-default" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-accent-violet/20 border-2 border-accent-violet/30 flex items-center justify-center text-lg font-bold text-accent-violet">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div>
            <p className="text-text-primary font-medium">{user?.name ?? "Unknown"}</p>
            <p className="text-text-muted text-sm mt-0.5">{user?.email ?? ""}</p>
            <p className="text-text-muted text-xs mt-1 font-mono">Signed in with Google</p>
          </div>
        </div>
      </Section>

      {/* AI preferences */}
      <Section icon={<Cpu size={15} />} title="AI Configuration">
        <div className="px-5 py-4 space-y-4">
          <Row label="Model" sub="The AI provider answering right now; others take over when it is busy">
            <span className="text-xs font-mono text-[#4FC3F7] bg-[#4FC3F7]/10 px-2 py-1 rounded">
              {health?.aiProvider ?? (health ? "Offline" : "Checking…")}
            </span>
          </Row>
          <Row label="Memory" sub="Remembers facts you tell it, across conversations">
            <span className="text-xs text-success font-mono">On</span>
          </Row>
          <Row label="Streaming" sub="Token-by-token response rendering">
            <span className="text-xs text-success font-mono">On</span>
          </Row>
        </div>
      </Section>

      {/* Security */}
      <Section icon={<Shield size={15} />} title="Security">
        <div className="px-5 py-4 space-y-3">
          <Row label="Authentication" sub="OAuth 2.0 via Google">
            <span className="text-xs text-success font-mono">Secure</span>
          </Row>
          <Row label="Session duration" sub="JWT token lifetime">
            <span className="text-xs text-text-muted font-mono">24 hours</span>
          </Row>
          <Row label="Data storage" sub="Your tasks/notes/goals/expenses sync to the cloud database when configured; otherwise this device only">
            <span className="text-xs text-text-muted font-mono">Private / per-user</span>
          </Row>
        </div>
      </Section>

      {/* System diagnostics */}
      <Section icon={<Activity size={15} />} title="System">
        <div className="px-5 py-4 space-y-3">
          {statusLoading ? (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 size={13} className="animate-spin" /> Checking services…
            </div>
          ) : (
            <>
              <StatusRow label="AI provider" ok={status?.ai} hint="Required: at least one AI provider key" />
              <StatusRow label="Speech to text" ok={status?.openai} hint="Optional: Groq, OpenAI or Gemini" />
              <StatusRow label="Web search" ok={status?.serper} hint="Optional: keyless search is used without it" />
              <StatusRow label="Database" ok={status?.database} hint="Required for sync across devices" />
              <StatusRow label="Google sign-in" ok={status?.google_oauth} hint="Required: sign-in, Gmail and Calendar" />
            </>
          )}
        </div>
      </Section>

      {/* About */}
      <Section icon={<ExternalLink size={15} />} title="About">
        <div className="px-5 py-4 space-y-2 text-sm text-text-muted font-mono">
          <div className="flex items-center justify-between">
            <span>Version</span><span className="text-text-secondary">0.1.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Stack</span><span className="text-text-secondary">Next.js 16 · Tailwind · Postgres</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Runtime</span><span className="text-text-secondary">Node.js · Vercel</span>
          </div>
        </div>
      </Section>

      {/* Sign out */}
      <button
        onClick={() => signOutAndClear({ callbackUrl: "/auth/signin" })}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-card border border-border-default text-text-secondary hover:text-accent-red hover:border-accent-red/30 transition-colors text-sm"
      >
        <LogOut size={15} />
        Sign out
      </button>

      {/* Danger zone — delete account */}
      <div className="bg-accent-red/5 border border-accent-red/25 rounded-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-accent-red/20">
          <span className="text-accent-red"><AlertTriangle size={16} /></span>
          <h2 className="text-sm font-semibold text-accent-red">Danger zone</h2>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-text-secondary">
            Permanently delete your account and <span className="text-text-primary">all associated data</span> -
            tasks, notes, goals, knowledge, music, life-log recordings, job-agent data, memory and connected tokens,
            on this device and in the cloud. This cannot be undone.
          </p>
          {!showDelete ? (
            <button onClick={() => { setShowDelete(true); setConfirmText(""); setDelError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-input border border-accent-red/40 text-accent-red text-sm hover:bg-accent-red/10 transition-colors">
              <Trash2 size={15} /> Delete my account
            </button>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs text-text-muted">Type <span className="font-mono text-accent-red">DELETE</span> to confirm{user?.email ? ` deletion of ${user.email}` : ""}.</label>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus
                placeholder="DELETE"
                className="w-full bg-background-base border border-accent-red/30 rounded-input px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-red/60" />
              {delError && <p className="text-xs text-accent-red flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-none" />{delError}</p>}
              <div className="flex items-center gap-2">
                <button onClick={deleteAccount} disabled={confirmText !== "DELETE" || deleting}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-input bg-accent-red/15 border border-accent-red/40 text-accent-red text-sm font-medium hover:bg-accent-red/25 disabled:opacity-40 transition-colors">
                  {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  {deleting ? "Deleting…" : "Permanently delete"}
                </button>
                <button onClick={() => { setShowDelete(false); setConfirmText(""); }} disabled={deleting}
                  className="px-4 py-2.5 rounded-input border border-border-default text-text-secondary text-sm hover:text-text-primary disabled:opacity-40">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-background-surface border border-border-default rounded-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-default">
        <span className="text-text-muted">{icon}</span>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function StatusRow({ label, ok, hint }: { label: string; ok?: boolean; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{hint}</p>
      </div>
      {ok === undefined ? (
        <span className="text-xs text-text-muted font-mono">-</span>
      ) : ok ? (
        <div className="flex items-center gap-1 text-success">
          <CheckCircle2 size={13} />
          <span className="text-xs font-mono">OK</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-accent-red">
          <XCircle size={13} />
          <span className="text-xs font-mono">Missing</span>
        </div>
      )}
    </div>
  );
}

