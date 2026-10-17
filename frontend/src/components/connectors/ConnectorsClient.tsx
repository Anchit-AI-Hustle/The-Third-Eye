"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Plug, Plus, Trash2 } from "lucide-react";
import { ConnectionsCard } from "@/components/settings/ConnectionsCard";
import { WhatsAppCard } from "@/components/settings/WhatsAppCard";
import { DeviceSyncCard } from "@/components/settings/DeviceSyncCard";
import { PermissionsCard } from "@/components/settings/PermissionsCard";
import { cn } from "@/lib/utils";

interface Connector { id: string; name: string; host: string; enabled: boolean; tool_count: number }

// Remote MCP servers that work with a URL (and optionally a key) — no
// per-app OAuth needed, so they can be added straight from this page.
const DIRECTORY = [
  { name: "Zapier", blurb: "8,000+ apps - Slack, Notion, Sheets, HubSpot… Copy your personal MCP URL.", href: "https://mcp.zapier.com" },
  { name: "Composio", blurb: "250+ apps with managed auth. Copy a server URL from your dashboard.", href: "https://composio.dev" },
  { name: "Pipedream", blurb: "2,500+ APIs. Create an MCP server and copy its URL.", href: "https://mcp.pipedream.com" },
  { name: "Your own server", blurb: "Any MCP server reachable over https (Streamable HTTP).", href: "https://modelcontextprotocol.io" },
];

export function ConnectorsClient() {
  const [list, setList] = useState<Connector[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", token: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/connectors").then(async (r) => {
      if (r.status === 501) { setUnavailable(true); setList([]); return; }
      const j = await r.json().catch(() => ({}));
      setList(j.connectors ?? []);
    }).catch(() => setList([]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setAdded(null);
    const r = await fetch("/api/connectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) { setError(j?.error ?? "Couldn't add the connector."); return; }
    setList((cur) => [...(cur ?? []), j.connector]);
    setAdded(`${j.connector.name} connected - ${j.connector.tool_count} tool${j.connector.tool_count === 1 ? "" : "s"} available to JARVIS.`);
    setForm({ name: "", url: "", token: "" });
  }

  async function toggle(c: Connector) {
    setList((cur) => cur?.map((x) => (x.id === c.id ? { ...x, enabled: !c.enabled } : x)) ?? null);
    await fetch("/api/connectors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, enabled: !c.enabled }) }).catch(() => null);
  }

  async function remove(c: Connector) {
    if (!confirm(`Remove ${c.name}? JARVIS will no longer use its tools.`)) return;
    setList((cur) => cur?.filter((x) => x.id !== c.id) ?? null);
    await fetch(`/api/connectors?id=${encodeURIComponent(c.id)}`, { method: "DELETE" }).catch(() => null);
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="hud-label text-text-muted mb-2">Built in</h2>
        <ConnectionsCard />
        <div className="mt-5">
          <WhatsAppCard />
        </div>
        <DeviceSyncCard />
        <PermissionsCard />
      </section>

      <section className="rounded-card border border-border-default bg-background-surface/30 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Plug size={15} className="text-[#4FC3F7]" />
          <h2 className="font-semibold text-text-primary text-sm">Your connectors</h2>
        </div>
        <p className="text-xs text-text-muted mb-4">
          Add any MCP server and JARVIS can use its tools in chat. Anything that changes data still asks you to confirm first.
        </p>

        {list === null ? (
          <div className="flex items-center gap-2 text-xs text-text-muted"><Loader2 size={12} className="animate-spin" /> Loading…</div>
        ) : (
          <ul className="space-y-2 mb-4">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-input border border-border-default bg-background-base/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary truncate">{c.name}</p>
                  <p className="text-[11px] font-mono text-text-muted truncate">{c.host} · {c.tool_count} tools</p>
                </div>
                <button type="button" role="switch" aria-checked={c.enabled} aria-label={`Use ${c.name} in chat`} onClick={() => void toggle(c)}
                  className={cn("relative w-9 h-5 rounded-full transition-colors flex-none", c.enabled ? "bg-success/70" : "bg-border-default")}>
                  <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", c.enabled ? "left-[18px]" : "left-0.5")} />
                </button>
                <button type="button" aria-label={`Remove ${c.name}`} onClick={() => void remove(c)} className="p-1.5 text-text-muted hover:text-accent-red flex-none">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {!list.length && <li className="text-xs text-text-muted">No connectors yet.</li>}
          </ul>
        )}

        {unavailable ? (
          <p className="text-xs text-warning">Connectors need the cloud database, which isn&apos;t configured on this deployment.</p>
        ) : (
          <form onSubmit={add} className="space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name, e.g. Zapier"
                className="bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none focus:border-border-hover" />
              <input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="API key / token (optional)" autoComplete="off"
                className="bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none focus:border-border-hover" />
            </div>
            <input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://… MCP server URL"
              className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none focus:border-border-hover" />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-input bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-[#4FC3F7] text-sm font-medium hover:bg-[#4FC3F7]/20 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {busy ? "Checking…" : "Add connector"}
              </button>
              {error && <span className="text-xs text-accent-red">{error}</span>}
              {added && <span className="inline-flex items-center gap-1 text-xs text-success"><Check size={12} /> {added}</span>}
            </div>
          </form>
        )}
      </section>

      <section>
        <h2 className="hud-label text-text-muted mb-2">Where to get a connector</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {DIRECTORY.map((d) => (
            <a key={d.name} href={d.href} target="_blank" rel="noopener noreferrer"
              className="group rounded-card border border-border-default bg-background-surface/30 p-3 hover:border-border-hover transition-colors">
              <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">{d.name} <ExternalLink size={11} className="text-text-muted group-hover:text-text-secondary" /></span>
              <span className="block text-[11px] text-text-muted mt-1">{d.blurb}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
