"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { dataList, dataInsert, dataUpdate, dataDelete } from "@/lib/dataClient";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category: string;
  target: number;
  current: number;
  unit: string;
  deadline?: string;
  created_at: string;
}

const KEY = "jarvis_goals_v1";

function ls(): Goal[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function lsSet(v: Goal[]) { localStorage.setItem(KEY, JSON.stringify(v)); }

export function useLocalGoals() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [ready, setReady] = useState(false);
  const remote = useRef(false);
  // Read by adjust(): a value computed inside a setState updater is not there
  // yet when React defers the updater, so the database write was skipped.
  const goalsRef = useRef(goals);
  goalsRef.current = goals;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    dataList<Goal>("goals").then((r) => {
      if (cancelled) return;
      remote.current = r.remote;
      setGoals(r.remote ? r.rows : ls());
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const add = useCallback(async (goal: Omit<Goal, "id" | "created_at">) => {
    const g: Goal = { ...goal, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setGoals((prev) => {
      const next = [g, ...prev];
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataInsert("goals", g);
    return g;
  }, []);

  const adjust = useCallback(async (id: string, delta: number) => {
    const goal = goalsRef.current.find((g) => g.id === id);
    if (!goal) return;
    const nextCurrent = Math.max(0, Math.min(goal.target, goal.current + delta));
    const next = goalsRef.current.map((g) => (g.id === id ? { ...g, current: nextCurrent } : g));
    goalsRef.current = next;
    setGoals(next);
    if (!remote.current) lsSet(next);
    else await dataUpdate("goals", id, { current: nextCurrent });
  }, []);

  const remove = useCallback(async (id: string) => {
    setGoals((prev) => {
      const next = prev.filter((g) => g.id !== id);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataDelete("goals", id);
  }, []);

  return { goals, ready, add, adjust, remove };
}
