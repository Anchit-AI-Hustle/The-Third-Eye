"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { dataList, dataInsert, dataUpdate, dataDelete } from "@/lib/dataClient";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskWorkspace = "office" | "personal";

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
  source_type?: string;
  source_link?: string;
  source_detail?: string;
  workspace?: TaskWorkspace;
  agent?: string; // appointed AgentProfile id
  all_updates?: string;
}

export interface TeamMember {
  id: string;
  name: string;
}

const TASK_KEY = "jarvis_tasks_v2";
const TEAM_KEY = "jarvis_team_v1";

function ls<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function lsSet(key: string, v: unknown) { localStorage.setItem(key, JSON.stringify(v)); }

/**
 * Fill in `completed_at` from a status change, unless the caller set it itself
 * (the edit form does). Moving a task back out of Done clears the date rather
 * than leaving a finish date on unfinished work.
 */
export function withCompletionStamp(patch: Partial<LocalTask>): Partial<LocalTask> {
  if (!patch.status || patch.completed_at !== undefined) return patch;
  if (patch.status === "done") return { ...patch, completed_at: new Date().toISOString().slice(0, 10) };
  return { ...patch, completed_at: "" };
}

export function useLocalTasks(statusFilter?: TaskStatus) {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [ready, setReady] = useState(false);
  // Whether persistence is server-backed. A ref so mutation callbacks always
  // read the current value without being re-created on every load.
  const remote = useRef(false);

  const load = useCallback((markReady = true) => {
    let cancelled = false;
    if (markReady) setReady(false);
    Promise.all([
      dataList<LocalTask>("tasks"),
      dataList<TeamMember>("team_members"),
    ]).then(([t, m]) => {
      if (cancelled) return;
      remote.current = t.remote;
      if (t.remote) {
        setTasks(t.rows);
        setTeam(m.rows);
      } else {
        setTasks(ls<LocalTask>(TASK_KEY));
        setTeam(ls<TeamMember>(TEAM_KEY));
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [userId, load]);

  // Refresh when foreground ingestion (Gmail/Chat → tasks) reports new work.
  useEffect(() => {
    const onUpdated = () => load(false);
    window.addEventListener("te:tasks-updated", onUpdated);
    return () => window.removeEventListener("te:tasks-updated", onUpdated);
  }, [load]);

  const create = useCallback(async (data: Omit<LocalTask, "id" | "created_at">) => {
    const t: LocalTask = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setTasks((prev) => {
      const next = [t, ...prev];
      if (!remote.current) lsSet(TASK_KEY, next);
      return next;
    });
    if (remote.current) await dataInsert("tasks", t);
    return t;
  }, []);

  const update = useCallback(async (id: string, data: Partial<LocalTask>) => {
    // The completion date has to be stamped wherever a task is finished — the
    // Kanban drag, the row buttons and the assistant all only sent `status`, so
    // the tracker's Completed column stayed empty and the dashboard's
    // "completed today" count sat at zero however much work got done.
    const patch = withCompletionStamp(data);
    setTasks((prev) => {
      const next = prev.map((t) => t.id === id ? { ...t, ...patch } : t);
      if (!remote.current) lsSet(TASK_KEY, next);
      return next;
    });
    if (remote.current) await dataUpdate("tasks", id, patch);
  }, []);

  const remove = useCallback(async (id: string) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (!remote.current) lsSet(TASK_KEY, next);
      return next;
    });
    if (remote.current) await dataDelete("tasks", id);
  }, []);

  const addMember = useCallback(async (name: string) => {
    const m: TeamMember = { id: crypto.randomUUID(), name };
    setTeam((prev) => {
      const next = [...prev, m];
      if (!remote.current) lsSet(TEAM_KEY, next);
      return next;
    });
    if (remote.current) await dataInsert("team_members", m);
  }, []);

  const removeMember = useCallback(async (id: string) => {
    setTeam((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (!remote.current) lsSet(TEAM_KEY, next);
      return next;
    });
    if (remote.current) await dataDelete("team_members", id);
  }, []);

  const allTasks = tasks;
  const filtered = statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks;
  return { tasks: filtered, allTasks, team, ready, create, update, remove, addMember, removeMember };
}
