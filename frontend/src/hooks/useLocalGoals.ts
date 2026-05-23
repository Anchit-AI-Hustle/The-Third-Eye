"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getSupabase } from "@/lib/supabase";

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

  useEffect(() => {
    const sb = getSupabase();
    if (sb && userId) {
      sb.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) { setGoals(ls()); } else { setGoals((data as Goal[]) ?? []); }
          setReady(true);
        });
    } else {
      setGoals(ls()); setReady(true);
    }
  }, [userId]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) return;
    const ch = sb.channel(`goals_${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "goals", filter: `user_id=eq.${userId}` },
        (p) => setGoals((prev) => prev.find((g) => g.id === p.new.id) ? prev : [p.new as Goal, ...prev]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "goals", filter: `user_id=eq.${userId}` },
        (p) => setGoals((prev) => prev.map((g) => g.id === p.new.id ? p.new as Goal : g)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "goals", filter: `user_id=eq.${userId}` },
        (p) => setGoals((prev) => prev.filter((g) => g.id !== (p.old as { id: string }).id)))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);

  const add = useCallback(async (goal: Omit<Goal, "id" | "created_at">) => {
    const g: Goal = { ...goal, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("goals").insert({ ...g, user_id: userId });
    } else {
      setGoals((prev) => { const next = [g, ...prev]; lsSet(next); return next; });
    }
  }, [userId]);

  const adjust = useCallback(async (id: string, delta: number) => {
    const sb = getSupabase();
    if (sb && userId) {
      const goal = (await sb.from("goals").select("current,target").eq("id", id).single()).data as { current: number; target: number } | null;
      if (goal) {
        const current = Math.max(0, Math.min(goal.target, goal.current + delta));
        await sb.from("goals").update({ current }).eq("id", id).eq("user_id", userId);
      }
    } else {
      setGoals((prev) => {
        const next = prev.map((g) => g.id === id ? { ...g, current: Math.max(0, Math.min(g.target, g.current + delta)) } : g);
        lsSet(next); return next;
      });
    }
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("goals").delete().eq("id", id).eq("user_id", userId);
    } else {
      setGoals((prev) => { const next = prev.filter((g) => g.id !== id); lsSet(next); return next; });
    }
  }, [userId]);

  return { goals, ready, add, adjust, remove };
}
