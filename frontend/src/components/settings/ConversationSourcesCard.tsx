"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw, Users, User, AlertCircle, Check } from "lucide-react";

// Which Chat spaces are allowed to feed the task tracker.
//
// Opt-in by design: a newly discovered space starts unchecked, so connecting
// Google Chat never silently pulls tasks out of every conversation you're in.
// Nothing is ingested until something here is switched on.

interface Conversation {
  conversationId: string;
  label: string | null;
  link: string | null;
  isGroup: boolean;
  included: boolean;
}

export function ConversationSourcesCard() {
  const [rows, setRows] = useState<Conversation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (discover: boolean) => {
    if (discover) setRefreshing(true);
    try {
      const r = await fetch(`/api/conversations?connector=google-chat${discover ? "&discover=1" : ""}`);
      const d = (await r.json()) as { conversations?: Conversation[]; error?: string; discoverError?: string | null };
      if (d.error) {
        setError(d.error);
        setRows([]);
        return;
      }
      setError(d.discoverError ? "Couldn't refresh from Google — showing the last known list." : null);
      setRows(d.conversations ?? []);
    } catch {
      setError("Couldn't load your chats.");
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  async function toggle(c: Conversation) {
    const next = !c.included;
    setBusy(c.conversationId);
    // Optimistic: reflect the click straight away, roll back if the write fails.
    setRows((prev) =>
      (prev ?? []).map((r) => (r.conversationId === c.conversationId ? { ...r, included: next } : r)),
    );
    try {
      const r = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connector: "google-chat",
          conversationIds: [c.conversationId],
          included: next,
        }),
      });
      const d = (await r.json()) as { updated?: number; error?: string };
      if (!r.ok || !d.updated) throw new Error(d.error ?? "write failed");
    } catch {
      setRows((prev) =>
        (prev ?? []).map((r) => (r.conversationId === c.conversationId ? { ...r, included: c.included } : r)),
      );
      setError("Couldn't save that change.");
    } finally {
      setBusy(null);
    }
  }

  const watching = (rows ?? []).filter((r) => r.included).length;

  return (
    <div className="holo-card rounded-card p-5 mt-5">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare size={14} className="text-[#4FC3F7]" />
        <span className="hud-label text-[#4FC3F7]">// Chat sources</span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-text-primary">Which chats feed the tracker</h2>
          <p className="text-text-muted text-xs font-mono mt-1 mb-4 tracking-wider">
            Only the spaces you switch on are scanned for tasks. Everything starts off.
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-[#4FC3F7]/30 text-[#4FC3F7] text-xs font-mono hover:bg-[#4FC3F7]/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-3 text-xs text-accent-red">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {rows === null ? (
        <p className="text-text-muted text-xs font-mono">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-text-muted text-xs font-mono">
          No chats found yet. Connect Google Chat above, then hit Refresh.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted mb-3 tracking-wider">
            {watching > 0 ? (
              <>
                <Check size={11} className="text-success" />
                Watching {watching} of {rows.length}
              </>
            ) : (
              <>
                <AlertCircle size={11} />
                Nothing selected — no chat tasks will be created
              </>
            )}
          </div>
          <ul className="divide-y divide-white/5">
            {rows.map((c) => (
              <li key={c.conversationId} className="flex items-center gap-3 py-2.5">
                {c.isGroup ? (
                  <Users size={13} className="shrink-0 text-text-muted" />
                ) : (
                  <User size={13} className="shrink-0 text-text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  {c.link ? (
                    <a
                      href={c.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm text-text-primary hover:text-[#4FC3F7] transition-colors"
                    >
                      {c.label ?? c.conversationId}
                    </a>
                  ) : (
                    <span className="block truncate text-sm text-text-primary">
                      {c.label ?? c.conversationId}
                    </span>
                  )}
                </div>
                <button
                  role="switch"
                  aria-checked={c.included}
                  aria-label={`${c.included ? "Stop watching" : "Watch"} ${c.label ?? c.conversationId}`}
                  onClick={() => void toggle(c)}
                  disabled={busy === c.conversationId}
                  className={`shrink-0 w-10 h-5 rounded-full border transition-colors disabled:opacity-50 ${
                    c.included
                      ? "bg-[#4FC3F7]/30 border-[#4FC3F7]/50"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <span
                    className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      c.included ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
