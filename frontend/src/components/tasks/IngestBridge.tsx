"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const MIN_GAP_MS = 60_000;
const POLL_MS = 3 * 60_000;

// Headless: as soon as a signed-in user opens the app (and whenever the tab
// regains focus, plus a slow background poll), pull new Gmail + Chat messages,
// analyse them and integrate relevant ones into the Task Tracker. Fires a
// "te:tasks-updated" event when anything changed so open task views refresh.
export function IngestBridge() {
  const { status } = useSession();
  const lastRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    const run = async () => {
      if (runningRef.current) return;
      if (Date.now() - lastRef.current < MIN_GAP_MS) return;
      runningRef.current = true;
      lastRef.current = Date.now();
      try {
        const res = await fetch("/api/ingest/run", { method: "POST" });
        if (res.ok) {
          const d = await res.json().catch(() => ({}));
          if (d.changed) window.dispatchEvent(new CustomEvent("te:tasks-updated"));
        }
      } catch { /* transient — next tick retries */ }
      runningRef.current = false;
    };

    run();
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(run, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [status]);

  return null;
}
