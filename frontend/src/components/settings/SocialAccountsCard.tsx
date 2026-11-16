"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Share2, X } from "lucide-react";

interface PlatformRow { id: string; name: string; available: boolean; accounts: { id: string; name: string }[] }

const NOTE: Record<string, string> = {
  connected: "Connected.",
  none: "Signed in, but there was nothing to post to. Facebook and Instagram need a Facebook Page (and an Instagram business or creator account linked to it).",
  error: "The sign-in didn't finish. Try again.",
  not_set_up: "This platform isn't set up on the server yet.",
};

// Each person's own social accounts, which the assistant posts to only when asked.
export function SocialAccountsCard() {
  const params = useSearchParams();
  const [rows, setRows] = useState<PlatformRow[] | null>(null);
  const status = params.get("social");
  const note = status ? NOTE[status.replace(/^[a-z]+_/, "")] : null;

  const load = useCallback(async () => {
    const r = await fetch("/api/social").then((x) => x.json()).catch(() => null);
    setRows(Array.isArray(r?.platforms) ? r.platforms : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const disconnect = async (platform: string, account: string) => {
    await fetch("/api/social", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, account }) });
    void load();
  };

  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4 space-y-3">
      <div className="flex items-center gap-2"><Share2 size={15} className="text-[#4FC3F7]" /><span className="hud-label text-[#4FC3F7]">Social accounts</span></div>
      <p className="text-sm text-text-secondary">Connect your own accounts and JARVIS can post for you when you ask, like "post this on LinkedIn and X". Nothing is posted without your say-so.</p>
      {note && <p className="text-xs text-text-muted">{note}</p>}
      {rows === null ? <p className="text-xs text-text-muted">Loading…</p> : (
        <ul className="divide-y divide-border-default">
          {rows.map((p) => (
            <li key={p.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-text-primary">{p.name}</p>
                {p.accounts.map((a) => (
                  <p key={a.id} className="text-xs text-text-muted flex items-center gap-1.5">
                    {a.name}
                    <button onClick={() => void disconnect(p.id, a.id)} aria-label={`Disconnect ${a.name}`} className="hover:text-accent-red"><X size={11} /></button>
                  </p>
                ))}
                {!p.available && <p className="text-xs text-text-muted">Not set up on the server yet.</p>}
              </div>
              {p.available && (
                <a href={`/api/connect/social/${p.id}`} className="flex-none px-3 py-1.5 rounded-input text-xs font-semibold text-[#07070F] bg-[#4FC3F7]">
                  {p.accounts.length ? "Add / refresh" : "Connect"}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
