"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { dataList, dataInsert, dataUpdate, dataDelete } from "@/lib/dataClient";

export interface Expense {
  id: string;
  amount: number;       // GST-inclusive — what you actually paid
  category: string;
  note?: string;
  gst_rate?: number | null;    // % of GST baked into `amount` (0/5/12/18/28/40); null/undefined = untracked
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

const EXPENSES_EVENT = "te:expenses-updated";
// Broadcast so every mounted useLocalExpenses instance reloads — e.g. when the
// assistant logs an expense through a different instance than the one the
// Finance view / chat payload reads from.
function broadcast() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EXPENSES_EVENT));
}

export function useLocalExpenses() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ready, setReady] = useState(false);
  const remote = useRef(false);

  const load = useCallback((markReady = true) => {
    let cancelled = false;
    if (markReady) setReady(false);
    dataList<Expense>("expenses").then((r) => {
      if (cancelled) return;
      remote.current = r.remote;
      setExpenses(r.remote ? r.rows : ls().sort(sortDesc));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [userId, load]);

  useEffect(() => {
    const onUpdated = () => load(false);
    window.addEventListener(EXPENSES_EVENT, onUpdated);
    return () => window.removeEventListener(EXPENSES_EVENT, onUpdated);
  }, [load]);

  const add = useCallback(async (data: { amount: number; category: string; note?: string; gst_rate?: number; spent_on?: string }) => {
    const e: Expense = {
      id: crypto.randomUUID(),
      amount: data.amount,
      category: data.category || "Other",
      note: data.note?.trim() || undefined,
      gst_rate: data.gst_rate && data.gst_rate > 0 ? data.gst_rate : undefined,
      spent_on: data.spent_on || new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };
    setExpenses((prev) => {
      const next = [e, ...prev].sort(sortDesc);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataInsert("expenses", e);
    broadcast();
    return e;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Omit<Expense, "id" | "created_at">>) => {
    setExpenses((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x)).sort(sortDesc);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataUpdate("expenses", id, patch);
    broadcast();
  }, []);

  const remove = useCallback(async (id: string) => {
    setExpenses((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataDelete("expenses", id);
    broadcast();
  }, []);

  return { expenses, ready, add, update, remove };
}
