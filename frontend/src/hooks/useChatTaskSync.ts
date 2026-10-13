"use client";

import { useCallback, useEffect, useRef } from "react";

// A chat is synced to the Task Tracker once it goes quiet, or as soon as the
// user leaves it, so a long back-and-forth costs one model call, not one a turn.
export const TASK_SYNC_IDLE_MS = 60_000;

export function useChatTaskSync() {
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const chatId = pending.current;
    pending.current = null;
    if (!chatId) return;
    void fetch("/api/chat/sync-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const schedule = useCallback((chatId: string) => {
    if (pending.current && pending.current !== chatId) flush();
    pending.current = chatId;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, TASK_SYNC_IDLE_MS);
  }, [flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  return { schedule, flush };
}
