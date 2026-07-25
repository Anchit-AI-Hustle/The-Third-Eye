"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { dataList, dataInsert, dataUpdate, dataDelete } from "@/lib/dataClient";

export interface LocalNote {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  created_at: string;
  updated_at: string;
}

const KEY = "jarvis_notes_v1";
function ls(): LocalNote[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function lsSet(v: LocalNote[]) { localStorage.setItem(KEY, JSON.stringify(v)); }

export function useLocalNotes() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [ready, setReady] = useState(false);
  const remote = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    dataList<LocalNote>("notes").then((r) => {
      if (cancelled) return;
      remote.current = r.remote;
      setNotes(r.remote ? r.rows : ls());
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const create = useCallback(async (title: string, content = "") => {
    const now = new Date().toISOString();
    const n: LocalNote = { id: crypto.randomUUID(), title, content, pinned: false, created_at: now, updated_at: now };
    setNotes((prev) => {
      const next = [n, ...prev];
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataInsert("notes", n);
    return n;
  }, []);

  const update = useCallback(async (id: string, data: Partial<LocalNote>) => {
    const patch = { ...data, updated_at: new Date().toISOString() };
    setNotes((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, ...patch } : n);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataUpdate("notes", id, patch);
  }, []);

  const remove = useCallback(async (id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataDelete("notes", id);
  }, []);

  return { notes, ready, create, update, remove };
}
