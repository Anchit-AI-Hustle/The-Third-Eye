"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTasks, createTask, updateTask, deleteTask } from "@/lib/api";
import { Task } from "@/types";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
import { STATUS_LABELS, PRIORITY_COLORS, formatRelativeTime, cn } from "@/lib/utils";

export function TasksClient() {
  const queryClient = useQueryClient();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [filter, setFilter] = useState<string | undefined>(undefined);

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["tasks", filter],
    queryFn: () => fetchTasks(filter),
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => createTask({ title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setNewTaskTitle("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) =>
      updateTask(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  function handleCreateTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    createMutation.mutate(title);
  }

  function toggleStatus(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done";
    updateMutation.mutate({ id: task.id, data: { status: newStatus } });
  }

  const FILTERS = [
    { label: "All", value: undefined },
    { label: "To Do", value: "todo" },
    { label: "In Progress", value: "in_progress" },
    { label: "Done", value: "done" },
  ];

  return (
    <div className="space-y-5">
      {/* Create Task Input */}
      <div className="bg-background-surface border border-border-default rounded-card px-4 py-3 flex items-center gap-3 focus-within:border-border-hover transition-colors">
        <Plus size={15} className="text-text-muted flex-none" />
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
          placeholder="New task..."
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-sm outline-none"
        />
        <button
          onClick={handleCreateTask}
          disabled={!newTaskTitle.trim() || createMutation.isPending}
          className="text-accent-blue text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:text-accent-blue/80 transition-colors"
        >
          {createMutation.isPending ? "Adding..." : "Add"}
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 border-b border-border-default pb-0">
        {FILTERS.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setFilter(value)}
            className={cn(
              "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              filter === value
                ? "border-accent-blue text-accent-blue"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="text-center py-12 text-text-muted text-sm">Loading tasks...</div>
      ) : error ? (
        <div className="text-center py-12 text-accent-red text-sm">
          Failed to load tasks. Check backend connection.
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          No tasks found. Create one above or ask JARVIS.
        </div>
      ) : (
        <div className="bg-background-surface border border-border-default rounded-card divide-y divide-border-default">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 px-5 py-3 hover:bg-background-elevated transition-colors group"
            >
              <button
                onClick={() => toggleStatus(task)}
                className="flex-none text-text-muted hover:text-accent-blue transition-colors"
                title={task.status === "done" ? "Mark todo" : "Mark done"}
              >
                {task.status === "done" ? (
                  <CheckCircle2 size={16} className="text-success" />
                ) : (
                  <Circle size={16} />
                )}
              </button>

              <span
                className={cn(
                  "flex-1 text-sm truncate",
                  task.status === "done" ? "text-text-muted line-through" : "text-text-primary"
                )}
              >
                {task.title}
              </span>

              <span
                className={cn(
                  "text-xs flex-none",
                  PRIORITY_COLORS[task.priority] ?? "text-text-muted"
                )}
              >
                {task.priority}
              </span>

              <span className="text-text-muted text-xs flex-none font-mono">
                {STATUS_LABELS[task.status]}
              </span>

              <span className="text-text-muted text-xs flex-none">
                {formatRelativeTime(task.created_at)}
              </span>

              <button
                onClick={() => deleteMutation.mutate(task.id)}
                className="flex-none text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all"
                title="Delete task"
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
