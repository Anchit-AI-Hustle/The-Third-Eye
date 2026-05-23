"use client";

import { useLocalTasks } from "@/hooks/useLocalTasks";
import { CheckSquare, MessageSquare, Zap, Brain, ArrowRight } from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
import Link from "next/link";

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-text-muted", medium: "bg-accent-blue", high: "bg-warning", urgent: "bg-accent-red",
};

export function DashboardClient() {
  const { allTasks, ready } = useLocalTasks();

  const open = allTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const doneToday = allTasks.filter((t) => {
    if (t.status !== "done" || !t.completed_at) return false;
    return new Date(t.completed_at).toDateString() === new Date().toDateString();
  });

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          href="/tasks"
          icon={<CheckSquare size={16} className="text-accent-blue" />}
          label="Open Tasks"
          value={ready ? String(open.length) : "—"}
          accent="blue"
        />
        <StatCard
          icon={<Zap size={16} className="text-success" />}
          label="Done Today"
          value={ready ? String(doneToday.length) : "—"}
          accent="green"
        />
        <StatCard
          href="/assistant"
          icon={<MessageSquare size={16} className="text-accent-violet" />}
          label="Ask JARVIS"
          value="→"
          accent="violet"
        />
        <StatCard
          icon={<Brain size={16} className="text-text-muted" />}
          label="Automations"
          value="Soon"
          accent="muted"
          muted
        />
      </div>

      {/* Recent tasks */}
      <div className="bg-background-surface border border-border-default rounded-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-default flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Open Tasks</h2>
          <Link href="/tasks" className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-blue transition-colors">
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {!ready ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" />
          </div>
        ) : open.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-text-muted text-sm">No open tasks.</p>
            <Link href="/tasks" className="text-accent-blue text-xs hover:underline mt-1 inline-block">
              Create one →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border-default">
            {open.slice(0, 7).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-background-elevated transition-colors">
                <span className={cn("w-2 h-2 rounded-full flex-none", PRIORITY_DOT[t.priority])} />
                <span className="flex-1 text-sm text-text-primary truncate">{t.title}</span>
                <span className="text-text-muted text-xs flex-none hidden sm:block">
                  {t.status === "in_progress" ? (
                    <span className="text-accent-blue">In Progress</span>
                  ) : "To Do"}
                </span>
                <span className="text-text-muted text-xs flex-none">{formatRelativeTime(t.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickLink href="/assistant" label="Ask JARVIS" sub="AI assistant" primary />
        <QuickLink href="/tasks" label="Tasks" sub={ready ? `${open.length} open` : "Manage tasks"} />
        <QuickLink href="/knowledge" label="Knowledge" sub="Upload & search" />
        <QuickLink href="/finance" label="Finance" sub="Overview" />
      </div>
    </div>
  );
}

function StatCard({
  href, icon, label, value, accent, muted,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "blue" | "green" | "violet" | "muted";
  muted?: boolean;
}) {
  const border = {
    blue: "hover:border-accent-blue/30",
    green: "hover:border-success/30",
    violet: "hover:border-accent-violet/30",
    muted: "",
  }[accent];

  const valueColor = {
    blue: "text-accent-blue",
    green: "text-success",
    violet: "text-accent-violet",
    muted: "text-text-muted",
  }[accent];

  const inner = (
    <div className={cn(
      "bg-background-surface border border-border-default rounded-card p-4 transition-colors h-full",
      !muted && border,
      muted && "opacity-50"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-1.5 bg-background-elevated rounded-input">{icon}</div>
        <span className={cn("font-display text-2xl font-bold", valueColor)}>{value}</span>
      </div>
      <p className="text-text-muted text-xs">{label}</p>
    </div>
  );

  if (href && !muted) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

function QuickLink({ href, label, sub, primary }: { href: string; label: string; sub: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-card border px-4 py-3.5 transition-colors flex flex-col gap-1",
        primary
          ? "border-accent-blue/30 bg-accent-blue/5 hover:bg-accent-blue/10"
          : "border-border-default bg-background-surface hover:border-border-hover"
      )}
    >
      <span className={cn("text-sm font-medium", primary ? "text-accent-blue" : "text-text-primary")}>{label}</span>
      <span className="text-text-muted text-xs">{sub}</span>
    </Link>
  );
}
