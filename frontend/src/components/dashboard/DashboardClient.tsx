"use client";

import { useState, useEffect } from "react";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { useAgentProfile } from "@/hooks/useAgentProfile";
import { SignalTrace } from "@/components/hud/SignalTrace";
import { DashboardWidgets } from "./DashboardWidgets";
import { cn } from "@/lib/utils";
import { isAgentKilled, AGENT_EVENT } from "@/lib/agentControl";
import { taskStatusLabel } from "@/lib/taskStatus";
import {
  CheckSquare, MessageSquare, Zap, Brain, ArrowRight, Clock,
  Target, FileText, Cpu, Shield, Mic, AlertTriangle,
  Activity, Database, Eye,
} from "lucide-react";
import Link from "next/link";
import { FirstRunGuide } from "@/components/onboarding/FirstRunGuide";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { LogoMark } from "@/components/layout/LogoMark";

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
      setSeconds(String(now.getSeconds()).padStart(2, "0"));
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

// Kill-switch state (localStorage-backed, see lib/agentControl) so the HUD's
// "system status" claim never contradicts the Agent Activity widget, which
// already shows "Halted" once the switch is on.
function useKillSwitch() {
  const [killed, setKilled] = useState(false);
  useEffect(() => {
    const sync = () => setKilled(isAgentKilled());
    sync();
    window.addEventListener(AGENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AGENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return killed;
}

// Rendered inline in the page header (a server component), which is why this
// is its own tiny client piece rather than inline state there.
export function SystemStatusText() {
  const killed = useKillSwitch();
  const health = useSystemHealth();
  const text = killed ? "Agent halted: kill switch on"
    : !health ? "Checking systems"
    : health.ai === "down" ? "Assistant offline"
    : health.ai === "degraded" ? "Running on backup AI"
    : "All systems operational";
  return <span className={killed || health?.ai === "down" ? "text-accent-red" : undefined}>{text}</span>;
}

export function DashboardClient() {
  const { allTasks, ready } = useLocalTasks();
  const { active: agent } = useAgentProfile();
  const { time, date, seconds } = useClock();
  const uptime = useUptime();
  const health = useSystemHealth();
  const [voiceReady, setVoiceReady] = useState(false);
  useEffect(() => {
    const w = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceReady("speechSynthesis" in window && !!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  const killed = useKillSwitch();

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
    if (overdue.length > 0)    insights.push(`${overdue.length} task${overdue.length > 1 ? "s are" : " is"} overdue - review needed.`);
    if (urgent.length > 0)     insights.push(`${urgent.length} high-priority item${urgent.length > 1 ? "s" : ""} require your attention.`);
    if (doneToday.length > 0)  insights.push(`${doneToday.length} task${doneToday.length > 1 ? "s" : ""} completed today - good momentum.`);
    if (inProgress.length > 0) insights.push(`${inProgress.length} task${inProgress.length > 1 ? "s" : ""} currently in progress.`);
    if (open.length === 0)     insights.push("All clear - no open tasks. Time to plan ahead.");
    if (insights.length === 0) insights.push(`System ready. Ask ${agent.name} anything to get started.`);
  }

  return (
    <div className="space-y-5 animate-fade-in">

      <FirstRunGuide />

      {/* ── Row 1: HUD Hero + logo ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Clock + HUD */}
        <div className="lg:col-span-2 holo-card rounded-card p-6 relative">
          <div className="relative">
            {/* Status bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <div className="flex items-center gap-2">
                <span
                  className="status-dot"
                  style={killed ? { background: "var(--color-accent-red)", boxShadow: "0 0 0 2px rgba(239,68,68,0.2), 0 0 8px rgba(239,68,68,0.4)" } : undefined}
                />
                <span className={cn("hud-label", killed ? "text-accent-red" : "text-[#4FC3F7]")}>
                  {killed ? "Agent Halted" : "System Online"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hud-label hidden sm:inline">uptime {uptime}</span>
                <span className={cn("hud-label", killed || health?.ai === "down" ? "text-accent-red" : "text-success")}>
                  {killed ? "kill switch engaged" : !health ? "checking" : health.ai === "down" ? "assistant offline" : health.ai === "degraded" ? "backup ai" : "all systems nominal"}
                </span>
              </div>
            </div>

            {/* Time display */}
            <div className="flex items-baseline gap-1 mb-1">
              <span className="font-display text-4xl sm:text-5xl font-semibold text-text-primary tracking-tight tabular-nums">
                {time || "--:--"}
              </span>
              <span className="font-display text-xl text-text-muted tabular-nums">
                :{seconds || "--"}
              </span>
            </div>
            <div className="text-text-secondary text-sm mb-6">{date}</div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-5">
              <HUDStat icon={<CheckSquare size={14} />} label="Active" value={ready ? open.length : "-"} />
              <HUDStat icon={<AlertTriangle size={14} />} label="Urgent" value={ready ? urgent.length : "-"} alert={urgent.length > 0} />
              <HUDStat icon={<Zap size={14} />} label="Completed" value={ready ? doneToday.length : "-"} />
              {overdue.length > 0 && (
                <HUDStat icon={<Clock size={14} />} label="Overdue" value={overdue.length} alert />
              )}
            </div>
            <SignalTrace className="h-10 mt-6 opacity-70" />
          </div>
        </div>

        {/* Logo + System Status */}
        <div className="holo-card rounded-card p-5 relative overflow-hidden flex flex-col items-center">
          <div className="hidden sm:flex flex-col items-center drop-shadow-[0_0_24px_rgba(123,92,240,0.35)]"><LogoMark size={112} /></div>
          <span className="hud-label self-start sm:self-center sm:mt-2 mb-4">Core systems</span>

          {/* System lines */}
          <div className="w-full space-y-2.5 mt-auto">
            <StatusRow icon={<Cpu size={12} />} label="AI Engine" value={health?.aiProvider ?? (health ? "Offline" : "…")} status={health?.ai === "down" ? "idle" : "online"} />
            <StatusRow icon={<Brain size={12} />} label="Memory" value={health?.database ? "Synced" : health ? "This device only" : "…"} status={health?.database ? "online" : "idle"} />
            <StatusRow icon={<Mic size={12} />} label="Voice I/O" value={voiceReady ? "Ready" : "Not supported here"} status={voiceReady ? "online" : "idle"} />
            <StatusRow icon={<Shield size={12} />} label="Auth" value="Signed in" status="online" />
            <StatusRow icon={<Database size={12} />} label="Knowledge" value={health?.database ? "Cloud" : health ? "This device only" : "…"} status={health?.database ? "online" : "idle"} />
          </div>
        </div>
      </div>

      {/* ── Command Center widgets ───────────────────────────── */}
      <DashboardWidgets />

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
              <LogoMark size={32} className="animate-pulse" />
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
                        {taskStatusLabel(t.status)}
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
            label={`Talk to ${agent.name}`}
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
      </div>

      {/* ── Row 3: Capabilities ──────────────────────────────── */}
      <div className="holo-card rounded-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={12} className="text-[#4FC3F7]" />
          <span className="hud-label text-[#4FC3F7]">Subsystem Matrix</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Streaming AI", active: health?.ai !== "down" },
            { label: "Task Ops", active: true },
            { label: "Voice I/O", active: voiceReady },
            { label: "Memory Core", active: !!health?.database },
            { label: "Knowledge DB", active: !!health?.database },
            { label: "Web Recon", active: health?.ai !== "down" },
            { label: "Comms (Email)", active: !!health?.google },
            { label: "Scheduler", active: !!health?.database },
            { label: "Finance AI", active: health?.ai !== "down" },
            { label: "Multi-Agent", active: health?.ai !== "down" },
            { label: "Automation", active: !!health?.database },
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

// Shown once, before any of the HUD chrome, only while the account has no
// tasks yet — the simplest available signal for "hasn't really started".
// Plain language on purpose: "Mission Queue" and "Subsystem Matrix" read fine
// once you know what this app is, but they don't explain it to someone who
// doesn't yet.
function HUDStat({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={alert ? "text-accent-red" : "text-[#4FC3F7]"}>{icon}</span>
      <span className={cn("font-display font-semibold text-xl tabular-nums", alert ? "text-accent-red" : "text-text-primary")}>
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
    online: "bg-success",
    idle: "bg-accent-blue/50",
    pending: "bg-text-muted",
  }[status];
  return (
    <div className="flex items-center gap-3">
      <span className="text-[#4FC3F7]/40 flex-none">{icon}</span>
      <span className="text-text-secondary text-xs flex-1">{label}</span>
      <span className="text-text-muted text-xs hidden sm:block">{value}</span>
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
