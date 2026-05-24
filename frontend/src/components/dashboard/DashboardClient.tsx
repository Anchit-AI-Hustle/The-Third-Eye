"use client";

import { useState, useEffect } from "react";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { cn } from "@/lib/utils";
import {
  CheckSquare, MessageSquare, Zap, Brain, ArrowRight, Clock,
  Target, FileText, Cpu, Shield, Mic, Globe, TrendingUp, AlertTriangle,
  Activity, Wifi, Database, Eye,
} from "lucide-react";
import Link from "next/link";

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-text-muted", medium: "bg-[#4FC3F7]", high: "bg-warning", urgent: "bg-accent-red",
};
const PRIORITY_RING: Record<string, string> = {
  low: "border-text-muted/20", medium: "border-[#4FC3F7]/30", high: "border-warning/30", urgent: "border-accent-red/40",
};

function useClock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [seconds, setSeconds] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
      setSeconds(now.toLocaleTimeString("en-US", { second: "2-digit", hour12: false }).split(":")[2]);
      setDate(now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return { time, date, seconds };
}

function useUptime() {
  const [uptime, setUptime] = useState("00:00:00");
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      setUptime(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return uptime;
}

export function DashboardClient() {
  const { allTasks, ready } = useLocalTasks();
  const { time, date, seconds } = useClock();
  const uptime = useUptime();

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

      {/* ── Row 1: HUD Hero + Arc Reactor ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Clock + HUD */}
        <div className="lg:col-span-2 holo-card rounded-card p-6 relative hud-scanline hud-frame">
          <div className="absolute inset-0 hud-grid pointer-events-none rounded-card" />
          <div className="relative">
            {/* Status bar */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="status-dot" />
                <span className="hud-label text-[#4FC3F7]">System Online</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hud-label">uptime {uptime}</span>
                <span className="hud-label text-success">all systems nominal</span>
              </div>
            </div>

            {/* Time display */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-mono text-5xl sm:text-6xl font-bold text-[#4FC3F7] tracking-tight" style={{ textShadow: '0 0 30px rgba(79,195,247,0.3)' }}>
                {time || "––:––"}
              </span>
              <span className="font-mono text-2xl text-[#4FC3F7]/50 animate-blink">
                :{seconds || "––"}
              </span>
            </div>
            <div className="text-text-secondary text-sm font-mono mb-6">{date}</div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-5">
              <HUDStat icon={<CheckSquare size={14} />} label="ACTIVE" value={ready ? open.length : "—"} />
              <HUDStat icon={<AlertTriangle size={14} />} label="URGENT" value={ready ? urgent.length : "—"} alert={urgent.length > 0} />
              <HUDStat icon={<Zap size={14} />} label="COMPLETED" value={ready ? doneToday.length : "—"} />
              {overdue.length > 0 && (
                <HUDStat icon={<Clock size={14} />} label="OVERDUE" value={overdue.length} alert />
              )}
            </div>
          </div>
        </div>

        {/* Arc Reactor + System Status */}
        <div className="holo-card rounded-card p-5 relative overflow-hidden flex flex-col items-center hud-frame">
          {/* Arc reactor */}
          <div className="arc-reactor arc-reactor-lg my-4">
            <div className="arc-reactor-ring3" />
            <div className="arc-reactor-core" />
          </div>
          <span className="hud-label mt-2 mb-4">J.A.R.V.I.S.</span>

          {/* System lines */}
          <div className="w-full space-y-2.5 mt-auto">
            <SystemLine icon={<Cpu size={12} />} label="AI Engine" value="Gemini 2.5" status="online" />
            <SystemLine icon={<Brain size={12} />} label="Memory" value="Active" status="online" />
            <SystemLine icon={<Mic size={12} />} label="Voice I/O" value="Ready" status="online" />
            <SystemLine icon={<Shield size={12} />} label="Auth" value="Secured" status="online" />
            <SystemLine icon={<Database size={12} />} label="Knowledge" value="Indexed" status="idle" />
            <SystemLine icon={<TrendingUp size={12} />} label="Finance" value="Phase 2" status="pending" />
          </div>
        </div>
      </div>

      {/* ── Data ticker ──────────────────────────────────────── */}
      <div className="data-ticker rounded-card px-4 py-1.5">
        <div className="data-ticker-inner">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-6 mr-6">
              <TickerItem label="TASKS" value={`${open.length} active`} />
              <TickerItem label="PRIORITY" value={`${urgent.length} high/urgent`} />
              <TickerItem label="COMPLETED" value={`${doneToday.length} today`} />
              <TickerItem label="VOICE" value="STT + TTS" />
              <TickerItem label="MODEL" value="gemini-2.5-flash" />
              <TickerItem label="STATUS" value="operational" />
              <TickerItem label="LATENCY" value="<200ms" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 2: Tasks + Quick Access ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Task list */}
        <div className="lg:col-span-2 holo-card rounded-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(79,195,247,0.1)]">
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-[#4FC3F7]" />
              <h2 className="hud-label text-[#4FC3F7] text-[11px]">Mission Queue</h2>
              {ready && urgent.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent-red/10 text-accent-red border border-accent-red/20">
                  {urgent.length} priority
                </span>
              )}
            </div>
            <Link href="/tasks" className="flex items-center gap-1 text-xs text-text-muted hover:text-[#4FC3F7] transition-colors">
              View all <ArrowRight size={11} />
            </Link>
          </div>

          {!ready ? (
            <div className="flex justify-center py-10">
              <div className="arc-reactor" style={{ width: 32, height: 32 }}>
                <div className="arc-reactor-core" style={{ width: 8, height: 8 }} />
              </div>
            </div>
          ) : open.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-text-muted text-sm">No active missions.</p>
              <Link href="/tasks" className="text-[#4FC3F7] text-xs hover:underline mt-1 inline-block">Create one →</Link>
            </div>
          ) : (
            <ul className="divide-y divide-[rgba(79,195,247,0.06)]">
              {[...open]
                .sort((a, b) => {
                  const order = { urgent: 0, high: 1, medium: 2, low: 3 };
                  return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
                })
                .slice(0, 8)
                .map((t) => {
                  const od = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(79,195,247,0.03)] transition-colors group">
                      <span className={cn(
                        "w-2 h-2 rounded-full flex-none border",
                        PRIORITY_DOT[t.priority],
                        PRIORITY_RING[t.priority]
                      )} />
                      <span className="flex-1 text-sm text-text-primary truncate">{t.title}</span>
                      {t.assignee && <span className="text-text-muted text-xs hidden sm:block">{t.assignee}</span>}
                      {t.due_date && (
                        <span className={cn("text-xs flex-none font-mono", od ? "text-accent-red" : "text-text-muted")}>
                          {od ? "overdue" : new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      <span className={cn(
                        "hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded border",
                        t.status === "in_progress" ? "text-[#4FC3F7] border-[#4FC3F7]/20 bg-[#4FC3F7]/5" : "text-text-muted border-border-default"
                      )}>
                        {t.status === "in_progress" ? "In Progress" : "To Do"}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <QuickCard
            href="/assistant"
            icon={<MessageSquare size={16} />}
            label="Talk to JARVIS"
            sub="AI assistant · Voice ready"
            glow
          />
          <QuickCard
            href="/tasks"
            icon={<CheckSquare size={16} />}
            label="Mission Tracker"
            sub={ready ? `${open.length} active · ${urgent.length} urgent` : "Manage missions"}
          />
          <QuickCard
            href="/notes"
            icon={<FileText size={16} />}
            label="Intel Notes"
            sub="Quick capture"
          />
          <QuickCard
            href="/goals"
            icon={<Target size={16} />}
            label="Objectives"
            sub="Track progress"
          />
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

      {/* ── Row 3: Capabilities ──────────────────────────────── */}
      <div className="holo-card rounded-card p-5 hud-frame">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={12} className="text-[#4FC3F7]" />
          <span className="hud-label text-[#4FC3F7]">Subsystem Matrix</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Streaming AI", active: true },
            { label: "Task Ops", active: true },
            { label: "Voice I/O", active: true },
            { label: "Memory Core", active: true },
            { label: "Knowledge DB", active: true },
            { label: "Web Recon", active: false },
            { label: "Comms (Email)", active: false },
            { label: "Scheduler", active: false },
            { label: "Finance AI", active: false },
            { label: "Multi-Agent", active: false },
            { label: "Automation", active: false },
            { label: "Digital Twin", active: false },
          ].map(({ label, active }) => (
            <div key={label} className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-input border text-xs transition-all",
              active
                ? "border-[#4FC3F7]/20 bg-[#4FC3F7]/5 text-text-secondary hover:border-[#4FC3F7]/40"
                : "border-border-default bg-background-elevated text-text-muted opacity-40"
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full flex-none",
                active ? "bg-[#4FC3F7] shadow-[0_0_6px_rgba(79,195,247,0.5)]" : "bg-text-muted"
              )} />
              <span className="truncate font-mono text-[11px]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HUDStat({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={alert ? "text-accent-red" : "text-[#4FC3F7]"}>{icon}</span>
      <span className={cn("font-mono font-bold text-xl", alert ? "text-accent-red" : "text-[#4FC3F7]")}
        style={!alert ? { textShadow: '0 0 10px rgba(79,195,247,0.3)' } : undefined}>
        {value}
      </span>
      <span className="hud-label">{label}</span>
    </div>
  );
}

function StatusRow({ icon, label, value, status }: {
  icon: React.ReactNode; label: string; value: string; status: "online" | "idle" | "pending";
}) {
  const dotCls = {
    online: "bg-[#4FC3F7] shadow-[0_0_6px_rgba(79,195,247,0.5)] animate-pulse",
    idle: "bg-accent-blue/50",
    pending: "bg-text-muted",
  }[status];
  return (
    <div className="flex items-center gap-3">
      <span className="text-[#4FC3F7]/40 flex-none">{icon}</span>
      <span className="text-text-secondary text-xs flex-1 font-mono">{label}</span>
      <span className="text-text-muted text-[10px] font-mono hidden sm:block">{value}</span>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-none", dotCls)} />
    </div>
  );
}

function QuickCard({ href, icon, label, sub, glow }: {
  href: string; icon: React.ReactNode; label: string; sub: string; glow?: boolean;
}) {
  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-4 py-3.5 rounded-card transition-all holo-card",
      glow && "animate-border-glow card-glow-arc"
    )}>
      <span className="text-[#4FC3F7] flex-none">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted truncate">{sub}</p>
      </div>
      <ArrowRight size={13} className="ml-auto text-text-muted flex-none" />
    </Link>
  );
}

function TickerItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-1 h-1 rounded-full bg-[#4FC3F7]/40" />
      <span className="hud-label text-[#4FC3F7]/60">{label}</span>
      <span className="text-[10px] font-mono text-text-muted">{value}</span>
    </span>
  );
}
