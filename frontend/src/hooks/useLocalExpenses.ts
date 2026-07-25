"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { dataList, dataInsert, dataUpdate, dataDelete } from "@/lib/dataClient";

export interface Expense {
  id: string;
  amount: number;
  category: string;
  note?: string;
  spent_on: string;   // YYYY-MM-DD
  created_at: string;
}

const KEY = "jarvis_expenses_v1";

function ls(): Expense[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function lsSet(v: Expense[]) { localStorage.setItem(KEY, JSON.stringify(v)); }

function sortDesc(a: Expense, b: Expense) {
  if (a.spent_on !== b.spent_on) return a.spent_on < b.spent_on ? 1 : -1;
  return a.created_at < b.created_at ? 1 : -1;
}

export function useLocalExpenses() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ready, setReady] = useState(false);
  const remote = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    dataList<Expense>("expenses").then((r) => {
      if (cancelled) return;
      remote.current = r.remote;
      setExpenses(r.remote ? r.rows : ls().sort(sortDesc));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const add = useCallback(async (data: { amount: number; category: string; note?: string; spent_on?: string }) => {
    const e: Expense = {
      id: crypto.randomUUID(),
      amount: data.amount,
      category: data.category || "Other",
      note: data.note?.trim() || undefined,
      spent_on: data.spent_on || new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };
    setExpenses((prev) => {
      const next = [e, ...prev].sort(sortDesc);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataInsert("expenses", e);
    return e;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Omit<Expense, "id" | "created_at">>) => {
    setExpenses((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x)).sort(sortDesc);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataUpdate("expenses", id, patch);
  }, []);

  const remove = useCallback(async (id: string) => {
    setExpenses((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataDelete("expenses", id);
  }, []);

  return { expenses, ready, add, update, remove };
}
