"use client";

import { useState, KeyboardEvent } from "react";
import { useLocalTasks, TaskStatus, TaskPriority } from "@/hooks/useLocalTasks";
import { Plus, Trash2, CheckCircle2, Circle, ChevronDown } from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";

const FILTERS: { label: string; value: TaskStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "To Do", value: "todo" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" },
];

const PRIORITY_OPTIONS: { label: string; value: TaskPriority; color: string }[] = [
  { label: "Low", value: "low", color: "text-text-muted" },
  { label: "Medium", value: "medium", color: "text-accent-blue" },
  { label: "High", value: "high", color: "text-warning" },
  { label: "Urgent", value: "urgent", color: "text-accent-red" },
];

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low:    "bg-text-muted",
  medium: "bg-accent-blue",
  high:   "bg-warning",
  urgent: "bg-accent-red",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

export function TasksClient() {
  const [filter, setFilter] = useState<TaskStatus | undefined>(undefined);
  const { tasks, allTasks, ready, create, update, remove } = useLocalTasks(filter);

  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);

  function handleCreate() {
    const t = newTitle.trim();
    if (!t) return;
    create(t, newPriority);
    setNewTitle("");
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleCreate();
    if (e.key === "Escape") setNewTitle("");
  }

  function toggleDone(id: string, current: string) {
    update(id, { status: current === "done" ? "todo" : "done" });
  }

  function cycleStatus(id: string, current: TaskStatus) {
    const order: TaskStatus[] = ["todo", "in_progress", "done"];
    const next = order[(order.indexOf(current) + 1) % order.length];
    update(id, { status: next });
  }

  const openCount = allTasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
  const doneCount = allTasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Stats row */}
      {ready && allTasks.length > 0 && (
        <div className="flex gap-3">
          <Pill label="Open" value={openCount} color="blue" />
          <Pill label="Done" value={doneCount} color="green" />
          <Pill label="Total" value={allTasks.length} color="muted" />
        </div>
      )}

      {/* Create bar */}
      <div className="bg-background-surface border border-border-default rounded-card flex items-center gap-2 px-4 py-3 focus-within:border-border-hover transition-colors">
        <Plus size={15} className="text-text-muted flex-none" />
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Add a task… (Enter to save)"
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />

        {/* Priority picker */}
        <div className="relative flex-none">
          <button
            onClick={() => setShowPriorityPicker((v) => !v)}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-input border border-border-default hover:border-border-hover transition-colors text-text-secondary"
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", PRIORITY_DOT[newPriority])} />
            {PRIORITY_OPTIONS.find((p) => p.value === newPriority)?.label}
            <ChevronDown size={10} />
          </button>
          {showPriorityPicker && (
            <div className="absolute right-0 top-full mt-1 z-10 bg-background-elevated border border-border-default rounded-card py-1 min-w-[100px]">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { setNewPriority(p.value); setShowPriorityPicker(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-background-surface transition-colors",
                    p.color
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", PRIORITY_DOT[p.value])} />
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleCreate}
          disabled={!newTitle.trim()}
          className="text-xs font-medium text-accent-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:text-accent-blue/80 flex-none"
        >
          Add
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0 border-b border-border-default">
        {FILTERS.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setFilter(value)}
            className={cn(
              "px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
              filter === value
                ? "border-accent-blue text-accent-blue"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {label}
            {value === undefined && allTasks.length > 0 && (
              <span className="ml-2 text-[10px] font-mono bg-background-elevated text-text-muted px-1.5 py-0.5 rounded">
                {allTasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {!ready ? (
        <div className="py-12 text-center text-text-muted text-sm">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-text-muted text-sm">
            {filter ? `No ${STATUS_LABEL[filter]?.toLowerCase()} tasks.` : "No tasks yet."}
          </p>
          {!filter && (
            <p className="text-text-muted text-xs mt-1">
              Type above to create one, or ask JARVIS in the Assistant.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-background-surface border border-border-default rounded-card divide-y divide-border-default overflow-hidden">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-background-elevated transition-colors group"
            >
              <button
                onClick={() => toggleDone(task.id, task.status)}
                className="flex-none text-text-muted hover:text-accent-blue transition-colors"
                title={task.status === "done" ? "Mark todo" : "Mark done"}
              >
                {task.status === "done"
                  ? <CheckCircle2 size={16} className="text-success" />
                  : <Circle size={16} />
                }
              </button>

              <span
                className={cn(
                  "flex-1 text-sm truncate cursor-pointer",
                  task.status === "done" ? "text-text-muted line-through" : "text-text-primary"
                )}
                onClick={() => cycleStatus(task.id, task.status)}
                title="Click to cycle status"
              >
                {task.title}
              </span>

              <span
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 text-xs flex-none px-2 py-1 rounded-badge border",
                  task.status === "in_progress"
                    ? "border-accent-blue/30 text-accent-blue bg-accent-blue/5"
                    : task.status === "done"
                    ? "border-success/30 text-success bg-success/5"
                    : "border-border-default text-text-muted"
                )}
                onClick={() => cycleStatus(task.id, task.status)}
                style={{ cursor: "pointer" }}
                title="Click to cycle status"
              >
                {STATUS_LABEL[task.status]}
              </span>

              <span
                className={cn(
                  "hidden md:flex items-center gap-1 text-xs flex-none",
                  PRIORITY_DOT[task.priority] && ""
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", PRIORITY_DOT[task.priority])} />
                <span className="text-text-muted">{task.priority}</span>
              </span>

              <span className="text-text-muted text-xs flex-none">
                {formatRelativeTime(task.created_at)}
              </span>

              <button
                onClick={() => remove(task.id)}
                className="flex-none text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: "blue" | "green" | "muted" }) {
  const cls = { blue: "text-accent-blue", green: "text-success", muted: "text-text-muted" }[color];
  return (
    <div className="bg-background-surface border border-border-default rounded-card px-4 py-2 flex items-center gap-2">
      <span className={cn("font-display text-lg font-bold", cls)}>{value}</span>
      <span className="text-text-muted text-xs">{label}</span>
    </div>
  );
}
