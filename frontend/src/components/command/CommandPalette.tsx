"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useCapture } from "@/components/capture/CaptureContext";
import { ensureCapability } from "@/lib/permissionGate";

// ⌘K / Ctrl-K command palette — jump to any page or fire a quick action from
// one keystroke. Mounted globally; only active for signed-in users.

type ActionKind = "capture" | "new-task" | "new-note";
interface Cmd { id: string; label: string; group: string; href?: string; action?: ActionKind; keywords?: string }

const ACTIONS: Cmd[] = [
  { id: "act-task",    label: "New task",           group: "Action", action: "new-task", keywords: "todo create add tracker" },
  { id: "act-capture", label: "Start live capture", group: "Action", action: "capture",  keywords: "mic listen record voice transcribe" },
  { id: "act-note",    label: "New note",           group: "Action", action: "new-note", keywords: "write jot" },
  { id: "act-ask",     label: "Ask the assistant",  group: "Action", href: "/assistant", keywords: "chat ai jarvis" },
  { id: "act-music",   label: "Generate music",     group: "Action", href: "/tools/music", keywords: "song studio audio" },
];

const NAV: Cmd[] = [
  { id: "nav-dashboard",   label: "Dashboard",       group: "Go to", href: "/dashboard" },
  { id: "nav-assistant",   label: "Assistant",       group: "Go to", href: "/assistant" },
  { id: "nav-agents",      label: "Online Agents",   group: "Go to", href: "/agents" },
  { id: "nav-generations", label: "Generations",     group: "Go to", href: "/generations" },
  { id: "nav-tasks",       label: "Task Tracker",    group: "Go to", href: "/tasks", keywords: "todo" },
  { id: "nav-lifelog",     label: "Life Log",        group: "Go to", href: "/lifelog" },
  { id: "nav-notes",       label: "Notes",           group: "Go to", href: "/notes" },
  { id: "nav-goals",       label: "Goals",           group: "Go to", href: "/goals" },
  { id: "nav-knowledge",   label: "Knowledge",       group: "Go to", href: "/knowledge" },
  { id: "nav-studio",      label: "Studio",          group: "Go to", href: "/tools", keywords: "music video generate" },
  { id: "nav-skills",      label: "Skills",          group: "Go to", href: "/skills" },
  { id: "nav-job",         label: "Job Agent",       group: "Go to", href: "/job-agent" },
  { id: "nav-kolab",       label: "Kolab",           group: "Go to", href: "/kolab" },
  { id: "nav-apps",        label: "Apps",            group: "Go to", href: "/apps" },
  { id: "nav-finance",     label: "Finance",         group: "Go to", href: "/finance", keywords: "money expenses calculators tax" },
  { id: "nav-plans",       label: "Plans & Credits", group: "Go to", href: "/plans", keywords: "billing upgrade" },
  { id: "nav-capabilities",label: "Capabilities",    group: "Go to", href: "/capabilities" },
  { id: "nav-activity",    label: "Agent Activity",  group: "Go to", href: "/activity" },
  { id: "nav-audit",       label: "App Audit",       group: "Go to", href: "/audit" },
  { id: "nav-settings",    label: "Settings",        group: "Go to", href: "/settings", keywords: "permissions preferences account" },
];

const ALL: Cmd[] = [...ACTIONS, ...NAV];

// Subsequence fuzzy match: query chars must appear in order (typo-tolerant,
// non-contiguous). Returns a score (higher = better), or -1 for no match.
// Bonuses for contiguous runs and start-of-word hits so the best label wins.
function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let qi = 0, score = 0, run = 0, prev = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      run = ti === prev + 1 ? run + 1 : 0;
      score += 1 + run * 2 + (ti === 0 || t[ti - 1] === " " ? 3 : 0);
      prev = ti;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}

export function CommandPalette() {
  const { status } = useSession();
  const router = useRouter();
  const capture = useCapture();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const authed = status === "authenticated";
  // Gate the trap on auth: a hidden `open` on a public page would otherwise lock
  // body scroll via useFocusTrap even though the palette renders nothing.
  const trapRef = useFocusTrap(open && authed);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const authedRef = useRef(authed);
  useEffect(() => { authedRef.current = authed; }, [authed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (!authedRef.current) return; // no palette on public pages
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
    const s = q.trim();
    if (!s) return ALL;
    return ALL
      .map((c) => ({ c, score: fuzzyScore(s, `${c.label} ${c.keywords ?? ""}`) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [active]);

  if (status !== "authenticated" || !open) return null;

  const run = async (c?: Cmd) => {
    const cmd = c ?? results[active];
    if (!cmd) return;
    setOpen(false);
    switch (cmd.action) {
      case "capture":
        if (await ensureCapability("microphone")) capture.start();
        router.push("/tasks");
        break;
      case "new-task":
        // A pending flag survives the navigation; the target opens its composer
        // on mount, and a same-page event covers the already-there case.
        try { sessionStorage.setItem("te:compose", "task"); } catch { /* ignore */ }
        router.push("/tasks");
        window.dispatchEvent(new CustomEvent("te:new-task"));
        break;
      case "new-note":
        try { sessionStorage.setItem("te:compose", "note"); } catch { /* ignore */ }
        router.push("/notes");
        window.dispatchEvent(new CustomEvent("te:new-note"));
        break;
      default:
        if (cmd.href) router.push(cmd.href);
    }
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
      <div ref={trapRef} className="w-full max-w-lg rounded-2xl border border-border-default bg-background-elevated shadow-2xl overflow-hidden">
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
