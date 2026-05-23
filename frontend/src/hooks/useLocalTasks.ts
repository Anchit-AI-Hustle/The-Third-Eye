"use client";

import { useState, useEffect, useCallback } from "react";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface LocalTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  completed_at?: string;
}

const KEY = "jarvis_tasks_v1";

function load(): LocalTask[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); }
  catch { return []; }
}

function persist(tasks: LocalTask[]) {
  localStorage.setItem(KEY, JSON.stringify(tasks));
}

export function useLocalTasks(statusFilter?: TaskStatus) {
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { setTasks(load()); setReady(true); }, []);

  const create = useCallback((title: string, priority: TaskPriority = "medium") => {
    const t: LocalTask = {
      id: crypto.randomUUID(),
      title,
      status: "todo",
      priority,
      created_at: new Date().toISOString(),
    };
    setTasks((prev) => { const next = [t, ...prev]; persist(next); return next; });
    return t;
  }, []);

  const update = useCallback((id: string, data: Partial<LocalTask>) => {
    setTasks((prev) => {
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        const u = { ...t, ...data };
        if (data.status === "done" && !t.completed_at) u.completed_at = new Date().toISOString();
        if (data.status && data.status !== "done") delete u.completed_at;
        return u;
      });
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTasks((prev) => { const next = prev.filter((t) => t.id !== id); persist(next); return next; });
  }, []);

  const filtered = statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks;
  return { tasks: filtered, allTasks: tasks, ready, create, update, remove };
}
