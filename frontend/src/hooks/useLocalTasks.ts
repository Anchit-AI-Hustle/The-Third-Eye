"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getSupabase } from "@/lib/supabase";

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

function ls<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function lsSet(key: string, v: unknown) { localStorage.setItem(key, JSON.stringify(v)); }

export function useLocalTasks(statusFilter?: TaskStatus) {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (sb && userId) {
      Promise.all([
        sb.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("team_members").select("*").eq("user_id", userId),
      ]).then(([{ data: t }, { data: m }]) => {
        setTasks((t as LocalTask[]) ?? []);
        setTeam((m as TeamMember[]) ?? []);
        setReady(true);
      }).catch(() => {
        setTasks(ls<LocalTask>(TASK_KEY));
        setTeam(ls<TeamMember>(TEAM_KEY));
        setReady(true);
      });
    } else {
      setTasks(ls<LocalTask>(TASK_KEY));
      setTeam(ls<TeamMember>(TEAM_KEY));
      setReady(true);
    }
  }, [userId]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) return;
    const ch = sb.channel(`tasks_${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        (p) => setTasks((prev) => prev.find((t) => t.id === p.new.id) ? prev : [p.new as LocalTask, ...prev]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        (p) => setTasks((prev) => prev.map((t) => t.id === p.new.id ? p.new as LocalTask : t)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        (p) => setTasks((prev) => prev.filter((t) => t.id !== (p.old as any).id)))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);

  const create = useCallback(async (data: Omit<LocalTask, "id" | "created_at">) => {
    const t: LocalTask = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("tasks").insert({ ...t, user_id: userId });
    } else {
      setTasks((prev) => { const next = [t, ...prev]; lsSet(TASK_KEY, next); return next; });
    }
    return t;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<LocalTask>) => {
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("tasks").update(data).eq("id", id).eq("user_id", userId);
    } else {
      setTasks((prev) => { const next = prev.map((t) => t.id === id ? { ...t, ...data } : t); lsSet(TASK_KEY, next); return next; });
    }
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("tasks").delete().eq("id", id).eq("user_id", userId);
    } else {
      setTasks((prev) => { const next = prev.filter((t) => t.id !== id); lsSet(TASK_KEY, next); return next; });
    }
  }, [userId]);

  const addMember = useCallback(async (name: string) => {
    const m: TeamMember = { id: crypto.randomUUID(), name };
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("team_members").insert({ ...m, user_id: userId });
      setTeam((prev) => [...prev, m]);
    } else {
      setTeam((prev) => { const next = [...prev, m]; lsSet(TEAM_KEY, next); return next; });
    }
  }, [userId]);

  const removeMember = useCallback(async (id: string) => {
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("team_members").delete().eq("id", id).eq("user_id", userId);
      setTeam((prev) => prev.filter((m) => m.id !== id));
    } else {
      setTeam((prev) => { const next = prev.filter((m) => m.id !== id); lsSet(TEAM_KEY, next); return next; });
    }
  }, [userId]);

  const allTasks = tasks;
  const filtered = statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks;
  return { tasks: filtered, allTasks, team, ready, create, update, remove, addMember, removeMember };
}
