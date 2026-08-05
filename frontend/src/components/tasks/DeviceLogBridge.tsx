"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

// Headless device activity logger. On every device the app is opened on
// (computer or phone) it records what the operator actually does — which
// surface, for how long, on which device — buffers the events locally and
// ships them to /api/device-log. A slow background tick then asks the server
// to run AI Log Sync, which folds the logs into the Task Tracker.

// jarvis_ prefix → wiped by clearSensitiveLocalData on sign-out; scoped by
// email so a shared machine never flushes one user's events as another's.
const BUF_PREFIX = "jarvis_device_log_buf_v1:";
const SEAL_EVENT = "te:device-log-seal";
const MIN_SEGMENT_S = 5;
const FLUSH_MS = 60_000;
const SYNC_MS = 30 * 60_000;

interface LogEvent {
  device: string;
  platform: string;
  kind: string;
  title: string;
  url: string;
  duration_s: number;
  started_at: string;
  ended_at: string;
}

export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  return "Unknown device";
}

function readBuf(key: string): LogEvent[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function writeBuf(key: string, events: LogEvent[]) {
  try { localStorage.setItem(key, JSON.stringify(events.slice(-200))); } catch { /* full/blocked */ }
}

// Shared with LogSyncCard so an on-demand "Sync now" ships this device's
// buffered events before asking the server to summarize.
let flushing = false;
export async function flushDeviceLogs(email: string | null | undefined): Promise<void> {
  if (!email || flushing) return;
  // Seal the in-progress segment first (the bridge's listener is synchronous),
  // so activity right up to this moment is part of the upload.
  window.dispatchEvent(new CustomEvent(SEAL_EVENT));
  const key = BUF_PREFIX + email;
  const events = readBuf(key);
  if (!events.length) return;
  flushing = true;
  try {
    const res = await fetch("/api/device-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
    });
    if (res.ok) writeBuf(key, readBuf(key).slice(events.length));
  } catch { /* transient — next tick retries */ }
  flushing = false;
}

export function DeviceLogBridge() {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const pathname = usePathname();
  const segRef = useRef<{ path: string; title: string; start: number } | null>(null);

  // ── segment tracking: one event per (page, continuous visible stretch) ────
  useEffect(() => {
    if (status !== "authenticated" || !email) return;

    const key = BUF_PREFIX + email;
    const device = deviceLabel();
    const platform = navigator.userAgent.slice(0, 120);

    const close = () => {
      const seg = segRef.current;
      segRef.current = null;
      if (!seg) return;
      const dur = Math.round((Date.now() - seg.start) / 1000);
      if (dur < MIN_SEGMENT_S) return;
      writeBuf(key, [...readBuf(key), {
        device, platform, kind: "app_usage",
        title: seg.title, url: seg.path, duration_s: dur,
        started_at: new Date(seg.start).toISOString(),
        ended_at: new Date().toISOString(),
      }]);
    };

    const open = () => {
      if (document.visibilityState !== "visible") return;
      segRef.current = { path: pathname ?? "/", title: document.title || pathname || "/", start: Date.now() };
    };

    open();

    const onVisibility = () => {
      if (document.visibilityState === "visible") open();
      else close();
    };
    const onSeal = () => { close(); open(); };
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", close);
    window.addEventListener(SEAL_EVENT, onSeal);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", close);
      window.removeEventListener(SEAL_EVENT, onSeal);
      close();
    };
  }, [status, email, pathname]);

  // ── flush buffer + periodic AI sync ────────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated" || !email) return;

    const key = BUF_PREFIX + email;
    const beacon = () => {
      const events = readBuf(key);
      if (!events.length) return;
      const ok = navigator.sendBeacon?.(
        "/api/device-log",
        new Blob([JSON.stringify(events)], { type: "application/json" }),
      );
      if (ok) writeBuf(key, []);
    };

    const sync = async () => {
      await flushDeviceLogs(email);
      try {
        const res = await fetch("/api/ingest/logs", { method: "POST" });
        if (res.ok) {
          const d = await res.json().catch(() => ({}));
          if (d.changed) window.dispatchEvent(new CustomEvent("te:tasks-updated"));
        }
      } catch { /* transient */ }
    };

    const flushId = setInterval(() => flushDeviceLogs(email), FLUSH_MS);
    const syncId = setInterval(sync, SYNC_MS);
    const warmup = setTimeout(sync, 45_000); // fold in anything left from the last session
    window.addEventListener("pagehide", beacon);
    return () => {
      clearInterval(flushId);
      clearInterval(syncId);
      clearTimeout(warmup);
      window.removeEventListener("pagehide", beacon);
    };
  }, [status, email]);

  return null;
}
