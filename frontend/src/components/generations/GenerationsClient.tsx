"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wand2, Music, Workflow, Briefcase, HeartPulse, MessageSquare, FileText, Trash2, Search, Inbox, type LucideIcon } from "lucide-react";
import { GEN_APPS, deleteGeneration, listGenerations, type GenerationRecord } from "@/lib/generations";

const ICONS: Record<string, LucideIcon> = { Wand2, Music, Workflow, Briefcase, HeartPulse, MessageSquare };

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function GenerationsClient() {
  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [app, setApp] = useState<string>("");
  const [q, setQ] = useState("");

  const refresh = () => setItems(listGenerations());
  useEffect(() => {
    refresh(); setReady(true);
    const on = () => refresh();
    window.addEventListener("te:generations-updated", on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener("te:generations-updated", on); window.removeEventListener("storage", on); };
  }, []);

  const apps = useMemo(() => Array.from(new Set(items.map((g) => g.app))), [items]);
  const filtered = items.filter((g) =>
    (!app || g.app === app) &&
    (!q || g.title.toLowerCase().includes(q.toLowerCase()) || g.appLabel.toLowerCase().includes(q.toLowerCase())),
  );

  if (!ready) return <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" /></div>;

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-border-default bg-background-surface p-10 text-center">
        <Inbox size={26} className="mx-auto text-text-muted opacity-50 mb-3" />
        <p className="text-text-secondary text-sm">No generations yet.</p>
        <p className="text-text-muted text-xs mt-1">Create something in Studio, Music, Kolab, Job Agent or Health and it'll appear here with a full input → output view.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-background-surface border border-border-default rounded-card px-3 py-2.5">
          <Search size={14} className="text-text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search generations…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none" />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setApp("")} className={chip(app === "")}>All</button>
          {apps.map((a) => (
            <button key={a} onClick={() => setApp(a)} className={chip(app === a)}>{GEN_APPS[a]?.label ?? a}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((g) => {
          const meta = GEN_APPS[g.app] ?? { label: g.app, color: "#8891A8", icon: "FileText" };
          const Icon = ICONS[meta.icon] ?? FileText;
          return (
            <div key={g.id} className="group relative rounded-card border border-border-default bg-background-surface hover:border-accent-primary/50 transition-colors">
              <Link href={`/generations/${g.id}`} className="block p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-none" style={{ background: `${meta.color}1A`, color: meta.color }}><Icon size={14} /></span>
                  <span className="text-[11px] font-mono" style={{ color: meta.color }}>{g.appLabel}</span>
                  <span className="ml-auto text-[10px] font-mono text-text-muted">{timeAgo(g.createdAt)}</span>
                </div>
                <div className="text-sm font-medium text-text-primary line-clamp-2">{g.title}</div>
                {g.inputText && <div className="text-[11px] text-text-muted mt-1 line-clamp-2">{g.inputText}</div>}
                <div className="mt-2 text-[10px] font-mono uppercase tracking-wider text-text-muted">{g.kind}</div>
              </Link>
              <button onClick={() => deleteGeneration(g.id)} title="Delete"
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-red transition-opacity">
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <p className="text-text-muted text-sm text-center py-8">No matches.</p>}
    </div>
  );
}

function chip(active: boolean): string {
  return `px-3 py-2 rounded-card text-xs font-mono border transition-colors ${active ? "border-accent-primary text-accent-primary bg-accent-primary/10" : "border-border-default text-text-secondary hover:text-text-primary"}`;
}
