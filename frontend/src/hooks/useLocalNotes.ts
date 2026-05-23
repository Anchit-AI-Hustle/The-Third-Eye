"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getSupabase } from "@/lib/supabase";

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

  useEffect(() => {
    const sb = getSupabase();
    if (sb && userId) {
      sb.from("notes").select("*").eq("user_id", userId).order("pinned", { ascending: false }).order("updated_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) { setNotes(ls()); } else { setNotes((data as LocalNote[]) ?? []); }
          setReady(true);
        });
    } else {
      setNotes(ls()); setReady(true);
    }
  }, [userId]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) return;
    const ch = sb.channel(`notes_${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes", filter: `user_id=eq.${userId}` },
        (p) => setNotes((prev) => prev.find((n) => n.id === p.new.id) ? prev : [p.new as LocalNote, ...prev]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notes", filter: `user_id=eq.${userId}` },
        (p) => setNotes((prev) => prev.map((n) => n.id === p.new.id ? p.new as LocalNote : n)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notes", filter: `user_id=eq.${userId}` },
        (p) => setNotes((prev) => prev.filter((n) => n.id !== (p.old as any).id)))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);

  const create = useCallback(async (title: string, content = "") => {
    const n: LocalNote = { id: crypto.randomUUID(), title, content, pinned: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("notes").insert({ ...n, user_id: userId });
    } else {
      setNotes((prev) => { const next = [n, ...prev]; lsSet(next); return next; });
    }
    return n;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<LocalNote>) => {
    const patch = { ...data, updated_at: new Date().toISOString() };
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("notes").update(patch).eq("id", id).eq("user_id", userId);
    } else {
      setNotes((prev) => { const next = prev.map((n) => n.id === id ? { ...n, ...patch } : n); lsSet(next); return next; });
    }
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    const sb = getSupabase();
    if (sb && userId) {
      await sb.from("notes").delete().eq("id", id).eq("user_id", userId);
    } else {
      setNotes((prev) => { const next = prev.filter((n) => n.id !== id); lsSet(next); return next; });
    }
  }, [userId]);

  return { notes, ready, create, update, remove };
}
