"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";

interface State { configured: boolean; jarvisNumber: string | null; linked: boolean; phone: string | null; notify: boolean }
interface Pending { code: string; link: string | null; jarvisNumber: string | null }

export function WhatsAppCard() {
  const [s, setS] = useState<State | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = () => fetch("/api/whatsapp/link").then((r) => r.json()).then(setS).catch(() => setS(null));
  useEffect(() => { void load(); }, []);

  async function call(method: string, body?: unknown) {
    setBusy(true); setNote(null);
    const r = await fetch("/api/whatsapp/link", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) setNote(j?.error ?? "Something went wrong.");
    return r?.ok ? j : null;
  }

  async function startLink() {
    const j = await call("POST");
    if (j) setPending(j);
  }

  async function unlink() {
    if (await call("DELETE")) { setPending(null); void load(); }
  }

  async function toggle(notify: boolean) {
    if (await call("PATCH", { notify })) setS((x) => (x ? { ...x, notify } : x));
  }

  return (
    <section className="rounded-card border border-border-default bg-background-surface/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle size={15} className="text-success" />
        <h2 className="font-semibold text-text-primary text-sm flex-1">WhatsApp</h2>
        {s?.linked && <span className="text-xs text-success">Linked · {s.phone}</span>}
      </div>
      <p className="text-xs text-text-muted mb-3">
        Chat with JARVIS from WhatsApp and get reminders and your morning briefing there.
      </p>
      {!s ? (
        <div className="flex items-center gap-2 text-xs text-text-muted"><Loader2 size={12} className="animate-spin" /> Loading…</div>
      ) : !s.configured ? (
        <p className="text-xs text-text-muted">WhatsApp isn&apos;t set up on this deployment yet.</p>
      ) : s.linked ? (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={s.notify} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
            Send reminders and briefings to WhatsApp
          </label>
          <button type="button" onClick={() => void unlink()} disabled={busy}
            className="px-3 py-1.5 rounded-input border border-border-default text-xs text-text-secondary hover:text-accent-red disabled:opacity-50">Unlink</button>
        </div>
      ) : pending ? (
        <div className="space-y-2 text-sm text-text-secondary">
          <p>Send this from your WhatsApp{pending.jarvisNumber ? <> to <span className="font-mono">+{pending.jarvisNumber}</span></> : null} within 15 minutes:</p>
          <p className="text-lg text-text-primary">LINK {pending.code}</p>
          <div className="flex items-center gap-2">
            {pending.link && (
              <a href={pending.link} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 rounded-input bg-success/15 border border-success/30 text-success text-xs font-medium">Open WhatsApp</a>
            )}
            <button type="button" onClick={() => void load()} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary">I&apos;ve sent it</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => void startLink()} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-success/15 border border-success/30 text-success text-xs font-medium disabled:opacity-50">
          {busy && <Loader2 size={12} className="animate-spin" />} Link my WhatsApp
        </button>
      )}
      {note && <p className="mt-2 text-xs text-warning">{note}</p>}
      <OpenClawBridge />
    </section>
  );
}

// OpenClaw already runs on the user's own WhatsApp; this token lets it hand
// messages to JARVIS (POST /api/bridge/message) without Meta's API.
function OpenClawBridge() {
  const [active, setActive] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/bridge/token").then((r) => r.json()).then((j) => setActive(!!j.active)).catch(() => setActive(false));
  }, []);

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    const j = await fetch("/api/bridge/token", { method }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setBusy(false);
    if (!j) return;
    setToken(j.token ?? null);
    setActive(method === "POST");
  }

  return (
    <div className="mt-4 pt-4 border-t border-border-default/60 space-y-2">
      <p className="text-sm text-text-primary font-medium">Use your own number through OpenClaw</p>
      <p className="text-xs text-text-muted">
        Install the <span className="font-mono">jarvis</span> skill from <span className="font-mono">integrations/openclaw</span> and give it this token as <span className="font-mono">JARVIS_TOKEN</span>. OpenClaw then passes your WhatsApp messages to JARVIS and sends back its replies.
      </p>
      {token && (
        <div className="space-y-1">
          <p className="text-xs text-warning">Copy it now - it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-input border border-border-default bg-background-base px-2 py-1.5 text-xs text-text-primary">{token}</code>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(token); setCopied(true); }}
              className="px-3 py-1.5 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary">{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setCopied(false); void call("POST"); }} disabled={busy || active === null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-success/15 border border-success/30 text-success text-xs font-medium disabled:opacity-50">
          {busy && <Loader2 size={12} className="animate-spin" />} {active ? "Replace token" : "Create OpenClaw token"}
        </button>
        {active && (
          <button type="button" onClick={() => { setToken(null); void call("DELETE"); }} disabled={busy}
            className="px-3 py-1.5 rounded-input border border-border-default text-xs text-text-secondary hover:text-accent-red disabled:opacity-50">Revoke</button>
        )}
      </div>
    </div>
  );
}
