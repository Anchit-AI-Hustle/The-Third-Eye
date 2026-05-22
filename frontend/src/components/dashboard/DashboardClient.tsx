"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTasks } from "@/lib/api";
import { CheckSquare, MessageSquare, Clock, Zap } from "lucide-react";
import { STATUS_LABELS, PRIORITY_COLORS, formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

export function DashboardClient() {
  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(),
  });

  const todayTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const completedToday = tasks.filter((t) => {
    if (t.status !== "done" || !t.completed_at) return false;
    const completed = new Date(t.completed_at);
    const today = new Date();
    return (
      completed.getDate() === today.getDate() &&
      completed.getMonth() === today.getMonth() &&
      completed.getFullYear() === today.getFullYear()
    );
  });

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Tasks"
          value={isLoading ? "—" : String(todayTasks.length)}
          icon={<CheckSquare size={16} className="text-accent-blue" />}
        />
        <StatCard
          label="Completed Today"
          value={isLoading ? "—" : String(completedToday.length)}
          icon={<Zap size={16} className="text-success" />}
        />
        <StatCard
          label="AI Sessions"
          value="—"
          icon={<MessageSquare size={16} className="text-accent-violet" />}
          href="/assistant"
        />
        <StatCard
          label="Automations"
          value="Ph4"
          icon={<Clock size={16} className="text-text-muted" />}
          disabled
        />
      </div>

      {/* Task List */}
      <div className="bg-background-surface border border-border-default rounded-card">
        <div className="px-5 py-4 border-b border-border-default flex items-center justify-between">
          <h2 className="text-text-primary font-medium text-sm">Open Tasks</h2>
          <Link
            href="/tasks"
            className="text-text-muted text-xs hover:text-accent-blue transition-colors"
          >
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className="px-5 py-8 text-center text-text-muted text-sm">Loading...</div>
        ) : error ? (
          <div className="px-5 py-8 text-center text-accent-red text-sm">
            Could not load tasks. Check your connection.
          </div>
        ) : todayTasks.length === 0 ? (
          <div className="px-5 py-8 text-center text-text-muted text-sm">
            No open tasks.{" "}
            <Link href="/assistant" className="text-accent-blue hover:underline">
              Ask JARVIS to create one.
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border-default">
            {todayTasks.slice(0, 8).map((task) => (
              <li key={task.id} className="px-5 py-3 flex items-center gap-4 hover:bg-background-elevated transition-colors">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-none ${
                    task.priority === "urgent"
                      ? "bg-accent-red"
                      : task.priority === "high"
                      ? "bg-warning"
                      : "bg-border-hover"
                  }`}
                />
                <span className="flex-1 text-text-primary text-sm truncate">{task.title}</span>
                <span className="text-text-muted text-xs font-mono flex-none">
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

      {/* Quick Actions */}
      <div className="bg-background-surface border border-border-default rounded-card px-5 py-4">
        <h2 className="text-text-primary font-medium text-sm mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <QuickAction href="/assistant" label="Ask JARVIS" />
          <QuickAction href="/tasks" label="New Task" />
          <QuickAction href="/knowledge" label="Knowledge Base" disabled />
          <QuickAction href="/finance" label="Finance" disabled />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  href,
  disabled,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  href?: string;
  disabled?: boolean;
}) {
  const content = (
    <div className="bg-background-surface border border-border-default rounded-card px-5 py-4 hover:border-border-hover transition-colors">
      <div className="flex items-center justify-between mb-3">
        {icon}
        <span className={`text-xl font-display font-semibold ${disabled ? "text-text-muted" : "text-text-primary"}`}>
          {value}
        </span>
      </div>
      <p className="text-text-muted text-xs">{label}</p>
    </div>
  );

  if (href && !disabled) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return <div className={disabled ? "opacity-40 cursor-not-allowed" : ""}>{content}</div>;
}

function QuickAction({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="px-3 py-1.5 rounded-input border border-border-default text-text-muted text-xs opacity-40 cursor-not-allowed">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-input border border-border-default text-text-secondary text-xs hover:border-border-hover hover:text-text-primary transition-colors"
    >
      {label}
    </Link>
  );
}
