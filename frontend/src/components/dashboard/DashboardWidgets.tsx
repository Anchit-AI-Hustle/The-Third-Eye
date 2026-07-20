"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, CheckSquare, Radio, FileText, Target, BookOpen,
  BarChart2, Sparkles, ShieldCheck, ArrowRight, Activity, Settings, Wand2, Briefcase, LayoutGrid,
} from "lucide-react";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { useLocalGoals } from "@/hooks/useLocalGoals";
import { useLocalNotes } from "@/hooks/useLocalNotes";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { useLocalExpenses } from "@/hooks/useLocalExpenses";
import { getAgentLog, isAgentKilled, AGENT_EVENT } from "@/lib/agentControl";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// A widget grid on the dashboard surfacing every feature with live data, so the
// dashboard is a real command center rather than just a task list. GSAP staggers
// the cards in on mount (lazy-loaded, reduced-motion-aware).
export function DashboardWidgets() {
  const { allTasks } = useLocalTasks();
  const { goals } = useLocalGoals();
  const { notes } = useLocalNotes();
  const { docs } = useLocalKnowledge();
  const { expenses } = useLocalExpenses();
  const root = useRef<HTMLDivElement>(null);

  // Agent-safety layer state (kill switch + audit log) is localStorage-backed,
  // so read it on the client and stay live via the agent-control event.
  const [agent, setAgent] = useState({ count: 0, killed: false });
  useEffect(() => {
    const sync = () => setAgent({ count: getAgentLog().length, killed: isAgentKilled() });
    sync();
    window.addEventListener(AGENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AGENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const stats = useMemo(() => {
    const open = allTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
    const urgent = open.filter((t) => t.priority === "urgent" || t.priority === "high");
    const avgGoal = goals.length
      ? Math.round(goals.reduce((s, g) => s + (g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0), 0) / goals.length)
      : 0;
    const month = new Date().toISOString().slice(0, 7);
    const spend = expenses.filter((e) => e.spent_on?.startsWith(month)).reduce((s, e) => s + (e.amount || 0), 0);
    return { open: open.length, urgent: urgent.length, avgGoal, spend };
  }, [allTasks, goals, expenses]);

  const widgets = [
    { href: "/assistant", icon: MessageSquare, label: "Assistant", stat: "Ask anything", sub: "voice + actions", color: "#4FC3F7" },
    { href: "/apps", icon: LayoutGrid, label: "Apps", stat: "Open apps", sub: "daily apps + emergencies", color: "#34D399" },
    { href: "/tasks", icon: CheckSquare, label: "Task Tracker", stat: `${stats.open} open`, sub: `${stats.urgent} urgent`, color: "#4FC3F7" },
    { href: "/tasks", icon: Radio, label: "Live Capture", stat: "Capture", sub: "mic + inbox → tracker", color: "#F05B8D" },
    { href: "/notes", icon: FileText, label: "Notes", stat: `${notes.length}`, sub: "captured", color: "#F0C94E" },
    { href: "/goals", icon: Target, label: "Goals", stat: `${stats.avgGoal}%`, sub: "avg progress", color: "#34D399" },
    { href: "/knowledge", icon: BookOpen, label: "Knowledge", stat: `${docs.length}`, sub: "documents", color: "#A78BFA" },
    { href: "/finance", icon: BarChart2, label: "Finance", stat: `₹${inr.format(Math.round(stats.spend))}`, sub: "this month", color: "#4F8EF7" },
    { href: "/tools", icon: Wand2, label: "Studio", stat: "Create", sub: "pages · mailers · more", color: "#A78BFA" },
    { href: "/job-agent", icon: Briefcase, label: "Job Agent", stat: "Apply", sub: "search · tailor · track", color: "#4FC3F7" },
    { href: "/capabilities", icon: Sparkles, label: "Capabilities", stat: "Explore", sub: "what it can do", color: "#4FC3F7" },
    { href: "/activity", icon: Activity, label: "Agent Activity", stat: agent.killed ? "Halted" : `${agent.count}`, sub: agent.killed ? "kill switch on" : "actions logged", color: agent.killed ? "#EF4444" : "#34D399" },
    { href: "/audit", icon: ShieldCheck, label: "App Audit", stat: "Audit", sub: "honest ratings", color: "#34D399" },
    { href: "/settings", icon: Settings, label: "Settings", stat: "Configure", sub: "agent + account", color: "#94A3B8" },
  ];

  useEffect(() => {
    let ctx: { revert: () => void } | undefined;
    import("gsap").then(({ gsap }) => {
      if (!root.current) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      ctx = gsap.context(() => {
        const items = gsap.utils.toArray<HTMLElement>("[data-widget]");
        if (reduce) { gsap.set(items, { opacity: 1, y: 0 }); return; }
        gsap.fromTo(items,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.05 });
      }, root);
    });
    return () => ctx?.revert();
  }, []);

  return (
    <div ref={root}>
      <div className="flex items-center gap-2 mb-3">
        <span className="hud-label text-[#4FC3F7]">Command Center</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {widgets.map((w) => {
          const Icon = w.icon;
          return (
            <Link key={w.href} href={w.href} data-widget
              className="group holo-card rounded-card p-4 hud-frame relative overflow-hidden hover:-translate-y-0.5 transition-transform duration-150">
              <div className="flex items-center justify-between mb-3">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none"
                  style={{ background: `${w.color}1A`, color: w.color }}>
                  <Icon size={16} />
                </span>
                <ArrowRight size={13} className="text-text-muted group-hover:text-[#4FC3F7] group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-lg font-semibold text-text-primary tabular-nums leading-none">{w.stat}</div>
              <div className="text-xs text-text-secondary mt-1">{w.label}</div>
              <div className="text-[10px] text-text-muted font-mono mt-0.5">{w.sub}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
