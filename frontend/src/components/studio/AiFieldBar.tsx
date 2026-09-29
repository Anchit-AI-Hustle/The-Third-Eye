"use client";

import { useRef, useState, type ReactNode } from "react";
import { Loader2, RefreshCw, Trash2, Wand2, Zap } from "lucide-react";

// An icon button with a fast CSS hover label, rather than the browser's own
// `title` tooltip — four similar icons in a row need telling apart at a glance.
export function IconBtn({ label, onClick, disabled, danger, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode;
}) {
  return (
    <span className="relative inline-flex group/icon">
      <button type="button" onClick={onClick} disabled={disabled}
        className={`p-1 rounded transition-colors disabled:opacity-40 ${danger ? "text-text-muted hover:text-accent-red" : "text-text-muted hover:text-[#34D399]"}`}>
        {children}
      </button>
      <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded border border-border-default bg-background-base px-1.5 py-0.5 text-[10px] font-mono text-text-secondary opacity-0 shadow-lg transition-opacity group-hover/icon:opacity-100">
        {label}
      </span>
    </span>
  );
}

export interface AiField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
}

const ACTIONS = [
  { id: "suggest", label: "Suggest", Icon: Wand2 },
  { id: "enhance", label: "Enhance", Icon: Zap },
  { id: "new", label: "New", Icon: RefreshCw },
] as const;

/**
 * Suggest / Enhance / New / Clear for one form field — the Music Studio toolbar,
 * for any tool. `context` is the rest of the form, so a suggestion fits it.
 */
export function AiFieldBar({ tool, field, value, context, onChange, clearTo = "" }: {
  tool: { label: string; purpose?: string };
  field: AiField;
  value: string;
  context: Record<string, string>;
  onChange: (v: string) => void;
  clearTo?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef<string[]>([]);
  // The field stays editable while a suggestion is in flight; this is what it
  // holds now, so a slow reply can't overwrite what was typed meanwhile.
  const latest = useRef(value);
  latest.current = value;

  async function run(action: (typeof ACTIONS)[number]["id"]) {
    setBusy(action); setError(null);
    try {
      const res = await fetch("/api/tools/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, field, value, action, context, previous: previous.current }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.suggestion) { setError(d.error ?? `HTTP ${res.status}`); return; }
      if (latest.current !== value) { setError("You edited the field meanwhile — kept your edit."); return; }
      if (value) previous.current = [...previous.current, value.slice(0, 120)].slice(-6);
      onChange(d.suggestion);
    } catch { setError("Network error."); }
    finally { setBusy(null); }
  }

  return (
    <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
      {ACTIONS.map(({ id, label, Icon }) => (
        <IconBtn key={id} label={label} onClick={() => run(id)} disabled={!!busy || (id === "enhance" && !value.trim())}>
          {busy === id ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
        </IconBtn>
      ))}
      <IconBtn label="Clear" onClick={() => { setError(null); onChange(clearTo); }} disabled={!!busy} danger>
        <Trash2 size={13} />
      </IconBtn>
      {error && <span className="text-[10px] normal-case text-accent-red">{error}</span>}
    </span>
  );
}
