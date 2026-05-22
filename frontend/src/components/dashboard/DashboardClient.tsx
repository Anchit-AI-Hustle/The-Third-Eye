"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTasks } from "@/lib/api";
import { CheckSquare, MessageSquare, Clock, Zap } from "lucide-react";
import { STATUS_LABELS, formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

export function DashboardClient() {
  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(),
  });

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const completedToday = tasks.filter((t) => {
    if (t.status !== "done" || !t.completed_at) return false;
    const d = new Date(t.completed_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="Open Tasks"
          value={isLoading ? "—" : String(openTasks.length)}
          icon={<CheckSquare size={18} className="text-accent-blue" />}
          color="blue"
          href="/tasks"
        />
        <StatCard
          label="Completed Today"
          value={isLoading ? "—" : String(completedToday.length)}
          icon={<Zap size={18} className="text-success" />}
          color="green"
        />
        <StatCard
          label="AI Sessions"
          value="—"
          icon={<MessageSquare size={18} className="text-accent-violet" />}
          color="violet"
          href="/assistant"
        />
        <StatCard
          label="Automations"
          value="Soon"
          icon={<Clock size={18} className="text-text-muted" />}
          color="muted"
          disabled
        />
      </div>

      {/* Task list */}
      <div className="bg-background-surface border border-border-default rounded-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-default flex items-center justify-between">
          <h2 className="text-text-primary font-semibold text-sm">Open Tasks</h2>
          <Link href="/tasks" className="text-text-muted text-xs hover:text-accent-blue transition-colors">
            View all →
          </Link>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center">
            <div className="w-5 h-5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div className="px-5 py-8 text-center text-accent-red text-sm">
            Could not load tasks.
          </div>
        ) : openTasks.length === 0 ? (
          <div className="px-5 py-10 text-center text-text-muted text-sm">
            No open tasks.{" "}
            <Link href="/assistant" className="text-accent-blue hover:underline">
              Ask JARVIS to create one.
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border-default">
            {openTasks.slice(0, 8).map((task) => (
              <li
                key={task.id}
                className="px-5 py-3.5 flex items-center gap-4 hover:bg-background-elevated transition-colors"
              >
                <span
                  className={`w-2 h-2 rounded-full flex-none ${
                    task.priority === "urgent"
                      ? "bg-accent-red"
                      : task.priority === "high"
                      ? "bg-warning"
                      : "bg-border-hover"
                  }`}
                />
                <span className="flex-1 text-text-primary text-sm truncate">{task.title}</span>
                <span className="text-text-muted text-xs font-mono flex-none hidden sm:block">
                  {STATUS_LABELS[task.status]}
                </span>
                <span className="text-text-muted text-xs flex-none">
                  {formatRelativeTime(task.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick actions */}
      <div className="bg-background-surface border border-border-default rounded-card px-5 py-4">
        <h2 className="text-text-primary font-semibold text-sm mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <QuickAction href="/assistant" label="Ask JARVIS" accent />
          <QuickAction href="/tasks" label="New Task" />
          <QuickAction href="/knowledge" label="Knowledge Base" disabled />
          <QuickAction href="/finance" label="Finance" disabled />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon, color, href, disabled,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "violet" | "muted";
  href?: string;
  disabled?: boolean;
}) {
  const glowClass = {
    blue:   "hover:border-accent-blue/30",
    green:  "hover:border-success/30",
    violet: "hover:border-accent-violet/30",
    muted:  "",
  }[color];

  const content = (
    <div
      className={`bg-background-surface border border-border-default rounded-card p-4 md:p-5 transition-colors ${!disabled ? glowClass : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-1.5 bg-background-elevated rounded-input">{icon}</div>
        <span
          className={`text-2xl md:text-3xl font-display font-bold ${
            disabled ? "text-text-muted" : "text-text-primary"
          }`}
        >
          {value}
        </span>
      </div>
      <p className="text-text-muted text-xs">{label}</p>
    </div>
  );

  if (href && !disabled) return <Link href={href} className="block">{content}</Link>;
  return <div className={disabled ? "opacity-40" : ""}>{content}</div>;
}

function QuickAction({ href, label, disabled, accent }: {
  href: string; label: string; disabled?: boolean; accent?: boolean;
}) {
  if (disabled) {
    return (
      <span className="px-4 py-2 rounded-input border border-border-default text-text-muted text-xs opacity-40 cursor-not-allowed">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`px-4 py-2 rounded-input border text-xs transition-colors ${
        accent
          ? "border-accent-blue/40 text-accent-blue bg-accent-blue/5 hover:bg-accent-blue/10"
          : "border-border-default text-text-secondary hover:border-border-hover hover:text-text-primary"
      }`}
    >
      {label}
    </Link>
  );
}
