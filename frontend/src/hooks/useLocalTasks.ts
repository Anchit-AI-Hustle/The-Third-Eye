"use client";

import { useState, useEffect, useCallback } from "react";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface LocalTask {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  status: TaskStatus;
  priority: TaskPriority;
  start_date?: string;
  due_date?: string;
  completed_at?: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  name: string;
}

const TASK_KEY = "jarvis_tasks_v2";
const TEAM_KEY = "jarvis_team_v1";

function loadTasks(): LocalTask[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TASK_KEY) ?? "[]"); }
  catch { return []; }
}

function loadTeam(): TeamMember[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TEAM_KEY) ?? "[]"); }
  catch { return []; }
}

function persistTasks(tasks: LocalTask[]) { localStorage.setItem(TASK_KEY, JSON.stringify(tasks)); }
function persistTeam(team: TeamMember[]) { localStorage.setItem(TEAM_KEY, JSON.stringify(team)); }

export function useLocalTasks(statusFilter?: TaskStatus) {
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTasks(loadTasks());
    setTeam(loadTeam());
    setReady(true);
  }, []);

  const create = useCallback((data: Omit<LocalTask, "id" | "created_at">) => {
    const t: LocalTask = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setTasks((prev) => { const next = [t, ...prev]; persistTasks(next); return next; });
    return t;
  }, []);

  const update = useCallback((id: string, data: Partial<LocalTask>) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...data } : t));
      persistTasks(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTasks((prev) => { const next = prev.filter((t) => t.id !== id); persistTasks(next); return next; });
  }, []);

  const addMember = useCallback((name: string) => {
    const m: TeamMember = { id: crypto.randomUUID(), name: name.trim() };
    setTeam((prev) => { const next = [...prev, m]; persistTeam(next); return next; });
  }, []);

  const removeMember = useCallback((id: string) => {
    setTeam((prev) => { const next = prev.filter((m) => m.id !== id); persistTeam(next); return next; });
  }, []);

  const filtered = statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks;
  return { tasks: filtered, allTasks: tasks, team, ready, create, update, remove, addMember, removeMember };
}
