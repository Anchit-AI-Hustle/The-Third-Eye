"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ⌘K / Ctrl-K command palette — jump to any page or fire a quick action from
// one keystroke. Mounted globally; only active for signed-in users.

interface Cmd { id: string; label: string; group: string; href: string; keywords?: string }

const ACTIONS: Cmd[] = [
  { id: "act-task",    label: "New task",            group: "Action", href: "/tasks",     keywords: "todo create add tracker" },
  { id: "act-capture", label: "Start live capture",  group: "Action", href: "/capture",   keywords: "mic listen record voice transcribe" },
  { id: "act-note",    label: "New note",            group: "Action", href: "/notes",      keywords: "write jot" },
  { id: "act-ask",     label: "Ask the assistant",   group: "Action", href: "/assistant",  keywords: "chat ai jarvis" },
  { id: "act-music",   label: "Generate music",      group: "Action", href: "/tools",      keywords: "song studio audio" },
];

const NAV: Cmd[] = [
  { id: "nav-dashboard",  label: "Dashboard",       group: "Go to", href: "/dashboard" },
  { id: "nav-assistant",  label: "Assistant",       group: "Go to", href: "/assistant" },
  { id: "nav-agents",     label: "Online Agents",   group: "Go to", href: "/agents" },
  { id: "nav-generations",label: "Generations",     group: "Go to", href: "/generations" },
  { id: "nav-tasks",      label: "Task Tracker",    group: "Go to", href: "/tasks", keywords: "todo" },
  { id: "nav-lifelog",    label: "Life Log",        group: "Go to", href: "/lifelog" },
  { id: "nav-notes",      label: "Notes",           group: "Go to", href: "/notes" },
  { id: "nav-goals",      label: "Goals",           group: "Go to", href: "/goals" },
  { id: "nav-knowledge",  label: "Knowledge",       group: "Go to", href: "/knowledge" },
  { id: "nav-studio",     label: "Studio",          group: "Go to", href: "/tools", keywords: "music video generate" },
  { id: "nav-skills",     label: "Skills",          group: "Go to", href: "/skills" },
  { id: "nav-job",        label: "Job Agent",       group: "Go to", href: "/job-agent" },
  { id: "nav-kolab",      label: "Kolab",           group: "Go to", href: "/kolab" },
  { id: "nav-apps",       label: "Apps",            group: "Go to", href: "/apps" },
  { id: "nav-finance",    label: "Finance",         group: "Go to", href: "/finance", keywords: "money expenses calculators tax" },
  { id: "nav-plans",      label: "Plans & Credits", group: "Go to", href: "/plans", keywords: "billing upgrade" },
  { id: "nav-capabilities", label: "Capabilities",  group: "Go to", href: "/capabilities" },
  { id: "nav-activity",   label: "Agent Activity",  group: "Go to", href: "/activity" },
  { id: "nav-audit",      label: "App Audit",       group: "Go to", href: "/audit" },
  { id: "nav-settings",   label: "Settings",        group: "Go to", href: "/settings", keywords: "permissions preferences account" },
];

const ALL: Cmd[] = [...ACTIONS, ...NAV];

export function CommandPalette() {
  const { status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ALL;
    return ALL.filter((c) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(s));
  }, [q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [active]);

  if (status !== "authenticated" || !open) return null;

  const run = (c?: Cmd) => {
    const cmd = c ?? results[active];
    if (!cmd) return;
    setOpen(false);
    router.push(cmd.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(); }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      role="dialog" aria-modal="true" aria-label="Command palette"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border-default bg-background-elevated shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-border-default">
          <Search size={16} className="text-text-muted flex-none" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search actions and pages…"
            className="flex-1 bg-transparent py-3.5 text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          <kbd className="text-[10px] font-mono text-text-muted border border-border-default rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No matches.</p>
          ) : results.map((c, i) => (
            <button
              key={c.id}
              ref={i === active ? activeRef : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                i === active ? "bg-accent-blue/10 text-text-primary" : "text-text-secondary hover:text-text-primary",
              )}
            >
              <span className="truncate">{c.label}</span>
              <span className="flex items-center gap-2 flex-none">
                <span className="text-[10px] font-mono text-text-muted">{c.group}</span>
                {i === active && <CornerDownLeft size={12} className="text-text-muted" />}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
