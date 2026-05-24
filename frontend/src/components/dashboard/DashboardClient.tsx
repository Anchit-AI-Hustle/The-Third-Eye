"use client";

import { useState, useEffect } from "react";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { cn } from "@/lib/utils";
import {
  CheckSquare, MessageSquare, Zap, Brain, ArrowRight, Clock,
  Target, FileText, Cpu, Shield, Mic, Globe, TrendingUp,
  AlertTriangle, Lightbulb, Plus, BookOpen, BarChart2,
} from "lucide-react";
import Link from "next/link";

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-text-muted", medium: "bg-accent-blue", high: "bg-warning", urgent: "bg-accent-red",
};

function useClock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setDate(now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return { time, date };
}

export function DashboardClient() {
  const { allTasks, ready } = useLocalTasks();
  const { time, date } = useClock();

  const open     = allTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const urgent   = open.filter((t) => t.priority === "urgent" || t.priority === "high");
  const doneToday = allTasks.filter((t) => {
    if (t.status !== "done" || !t.completed_at) return false;
    return new Date(t.completed_at).toDateString() === new Date().toDateString();
  });
  const overdue  = open.filter((t) => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()));
  const inProgress = open.filter((t) => t.status === "in_progress");

  // Generate AI Insights from available data
  const insights: string[] = [];
  if (ready) {
    if (overdue.length > 0)    insights.push(`${overdue.length} task${overdue.length > 1 ? "s are" : " is"} overdue — review needed.`);
    if (urgent.length > 0)     insights.push(`${urgent.length} high-priority item${urgent.length > 1 ? "s" : ""} require your attention.`);
    if (doneToday.length > 0)  insights.push(`${doneToday.length} task${doneToday.length > 1 ? "s" : ""} completed today — good momentum.`);
    if (inProgress.length > 0) insights.push(`${inProgress.length} task${inProgress.length > 1 ? "s" : ""} currently in progress.`);
    if (open.length === 0)     insights.push("All clear — no open tasks. Time to plan ahead.");
    if (insights.length === 0) insights.push("System ready. Ask JARVIS anything to get started.");
  }

  const topTask = [...open].sort((a, b) => {
    const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
  })[0];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Row 1: Daily Briefing ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Clock + Status */}
        <div className="lg:col-span-2 bg-background-surface border border-border-default rounded-card p-6 relative overflow-hidden hud-grid">
          <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/4 via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-5">
              <span className="status-dot" />
              <span className="text-[11px] font-mono text-success tracking-widest uppercase">JARVIS · ONLINE</span>
            </div>
            <div className="font-mono text-5xl sm:text-6xl font-bold text-white tracking-tight tabular-nums mb-1.5">
              {time || "––:––:––"}
            </div>
            <div className="text-text-secondary text-sm font-mono">{date}</div>

            <div className="mt-6 flex flex-wrap gap-5">
              <Metric icon={<CheckSquare size={13} />} label="Open"       value={ready ? open.length        : "—"} color="cyan" />
              <Metric icon={<AlertTriangle size={13} />} label="Urgent"   value={ready ? urgent.length      : "—"} color="red" />
              <Metric icon={<Zap size={13} />}           label="Done today" value={ready ? doneToday.length : "—"} color="green" />
              {overdue.length > 0 && (
                <Metric icon={<Clock size={13} />}       label="Overdue"  value={overdue.length}               color="orange" />
              )}
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-background-surface border border-border-default rounded-card p-5 space-y-1">
          <p className="text-[10px] font-mono text-text-muted tracking-widest uppercase mb-4">System Status</p>
          <StatusRow icon={<Cpu size={12} />}        label="AI Engine"   value="Sonnet 4.6"     status="online" />
          <StatusRow icon={<Brain size={12} />}      label="Memory"      value="Session active" status="online" />
          <StatusRow icon={<Mic size={12} />}        label="Voice"       value="STT + TTS"      status="online" />
          <StatusRow icon={<Shield size={12} />}     label="Auth"        value="Google OAuth"   status="online" />
          <StatusRow icon={<BookOpen size={12} />}   label="Knowledge"   value="Upload ready"   status="idle" />
          <StatusRow icon={<BarChart2 size={12} />}  label="Finance"     value="Coming soon"    status="pending" />
          <StatusRow icon={<Globe size={12} />}      label="Web Search"  value="Roadmap"        status="pending" />
          <StatusRow icon={<TrendingUp size={12} />} label="Automations" value="Roadmap"        status="pending" />
        </div>
      </div>

      {/* ── Row 2: AI Insights + Quick Actions ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* AI Insights */}
        <div className="lg:col-span-2 bg-background-surface border border-border-default rounded-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={14} className="text-accent-blue flex-none" />
            <h2 className="text-sm font-semibold text-text-primary">Intelligence Briefing</h2>
          </div>

          {!ready ? (
            <div className="flex justify-center py-6">
              <div className="w-4 h-4 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((text, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 px-3 rounded-input bg-background-elevated border border-border-default">
                  <span className="w-1 h-1 rounded-full bg-accent-blue mt-2 flex-none" />
                  <p className="text-sm text-text-secondary leading-relaxed">{text}</p>
                </div>
              ))}

              {topTask && (
                <div className="mt-2 flex items-center gap-3 py-3 px-4 rounded-input bg-accent-blue/5 border border-accent-blue/20">
                  <span className="text-[10px] font-mono text-accent-blue uppercase tracking-wider flex-none">Top priority</span>
                  <span className="text-sm text-text-primary font-medium truncate">{topTask.title}</span>
                  <Link href="/tasks" className="ml-auto flex-none text-accent-blue hover:opacity-80 transition-opacity">
                    <ArrowRight size={13} />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-2.5">
          <p className="text-[10px] font-mono text-text-muted tracking-widest uppercase px-1 mb-3">Quick Actions</p>
          <ActionCard href="/assistant"  icon={<MessageSquare size={15} />} label="Ask JARVIS"     sub="AI assistant"     color="cyan"   primary />
          <ActionCard href="/tasks"      icon={<Plus size={15} />}          label="Add Task"        sub="Capture & track"  color="violet" />
          <ActionCard href="/assistant"  icon={<Mic size={15} />}           label="Voice Mode"      sub="Just speak"       color="blue" />
          <ActionCard href="/knowledge"  icon={<BookOpen size={15} />}      label="Knowledge Base"  sub="Upload & search"  color="green" />
          <ActionCard href="/goals"      icon={<Target size={15} />}        label="Goals"           sub="Track progress"   color="orange" />
        </div>
      </div>

      {/* ── Row 3: Open Tasks ─────────────────────────────────────────── */}
      <div className="bg-background-surface border border-border-default rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            <CheckSquare size={14} className="text-accent-blue" />
            <h2 className="text-sm font-semibold text-text-primary">Open Tasks</h2>
            {ready && urgent.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent-red/10 text-accent-red border border-accent-red/20">
                {urgent.length} urgent
              </span>
            )}
          </div>
          <Link href="/tasks" className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-blue transition-colors">
            View all <ArrowRight size={11} />
          </Link>
        </div>

        {!ready ? (
          <div className="flex justify-center py-10">
            <div className="w-4 h-4 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" />
          </div>
        ) : open.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-text-muted text-sm">No open tasks.</p>
            <Link href="/tasks" className="text-accent-blue text-xs hover:underline mt-1 inline-block">Create one →</Link>
          </div>
        ) : (
          <ul className="divide-y divide-border-default">
            {[...open]
              .sort((a, b) => {
                const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
                return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
              })
              .slice(0, 8)
              .map((t) => {
                const od = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-background-elevated/50 transition-colors">
                    <span className={cn("w-1.5 h-1.5 rounded-full flex-none", PRIORITY_COLOR[t.priority] ?? "bg-text-muted")} />
                    <span className="flex-1 text-sm text-text-primary truncate">{t.title}</span>
                    {t.assignee && (
                      <span className="text-text-muted text-xs hidden sm:block">{t.assignee}</span>
                    )}
                    {t.due_date && (
                      <span className={cn("text-xs flex-none font-mono", od ? "text-accent-red" : "text-text-muted")}>
                        {od ? "overdue" : new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                    <span className={cn(
                      "hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded border",
                      t.status === "in_progress"
                        ? "text-accent-blue border-accent-blue/20 bg-accent-blue/5"
                        : "text-text-muted border-border-default"
                    )}>
                      {t.status === "in_progress" ? "In progress" : "To do"}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {/* ── Row 4: Capabilities Roadmap ───────────────────────────────── */}
      <div className="bg-background-surface border border-border-default rounded-card p-5">
        <p className="text-[10px] font-mono text-text-muted tracking-widest uppercase mb-4">Capabilities</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: "AI Chat",       active: true },
            { label: "Task Mgmt",     active: true },
            { label: "Voice I/O",     active: true },
            { label: "Memory",        active: true },
            { label: "Knowledge",     active: true },
            { label: "Goals",         active: true },
            { label: "Notes",         active: true },
            { label: "Cross-device",  active: true },
            { label: "Finance AI",    active: false },
            { label: "Web Search",    active: false },
            { label: "Email",         active: false },
            { label: "Automations",   active: false },
          ].map(({ label, active }) => (
            <div key={label} className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-input border text-xs",
              active
                ? "border-accent-blue/20 bg-accent-blue/5 text-text-secondary"
                : "border-border-default bg-background-elevated text-text-muted opacity-40"
            )}>
              <span className={cn("w-1 h-1 rounded-full flex-none", active ? "bg-accent-blue" : "bg-text-muted")} />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  const cls: Record<string, string> = {
    cyan: "text-accent-blue", green: "text-success", red: "text-accent-red", orange: "text-warning",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={cls[color] ?? "text-text-muted"}>{icon}</span>
      <span className={cn("font-display font-bold text-xl tabular-nums", cls[color])}>{value}</span>
      <span className="text-text-muted text-xs">{label}</span>
    </div>
  );
}

function StatusRow({ icon, label, value, status }: {
  icon: React.ReactNode; label: string; value: string; status: "online" | "idle" | "pending";
}) {
  const dot = { online: "bg-success animate-pulse-glow", idle: "bg-accent-blue/60", pending: "bg-text-muted/40" }[status];
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-text-muted flex-none">{icon}</span>
      <span className="text-text-secondary text-xs flex-1">{label}</span>
      <span className="text-text-muted text-[11px] font-mono hidden sm:block">{value}</span>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-none", dot)} />
    </div>
  );
}

function ActionCard({ href, icon, label, sub, color, primary }: {
  href: string; icon: React.ReactNode; label: string; sub: string; color: string; primary?: boolean;
}) {
  const styles: Record<string, string> = {
    cyan:   "text-accent-blue border-accent-blue/20 hover:border-accent-blue/50 hover:bg-accent-blue/5",
    violet: "text-accent-violet border-accent-violet/20 hover:border-accent-violet/50 hover:bg-accent-violet/5",
    blue:   "text-accent-blue border-accent-blue/15 hover:border-accent-blue/40 hover:bg-accent-blue/5",
    green:  "text-success border-success/20 hover:border-success/50 hover:bg-success/5",
    orange: "text-warning border-warning/20 hover:border-warning/50 hover:bg-warning/5",
  };
  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-card border transition-all bg-background-surface",
      styles[color] ?? styles.cyan,
      primary && "bg-accent-blue/5"
    )}>
      <span className="flex-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary leading-none">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{sub}</p>
      </div>
      <ArrowRight size={13} className="ml-auto text-text-muted flex-none" />
    </Link>
  );
}
