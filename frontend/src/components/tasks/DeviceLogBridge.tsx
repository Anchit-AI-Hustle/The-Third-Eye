"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

// Headless device activity logger. On every device the app is opened on
// (computer or phone) it records what the operator actually does — which
// surface, for how long, on which device — buffers the events locally and
// ships them to /api/device-log. A slow background tick then asks the server
// to run AI Log Sync, which folds the logs into the Task Tracker.

const BUF_KEY = "te_device_log_buf_v1";
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

function readBuf(): LogEvent[] {
  try { return JSON.parse(localStorage.getItem(BUF_KEY) ?? "[]"); } catch { return []; }
}
function writeBuf(events: LogEvent[]) {
  try { localStorage.setItem(BUF_KEY, JSON.stringify(events.slice(-200))); } catch { /* full/blocked */ }
}

// Shared with LogSyncCard so an on-demand "Sync now" ships this device's
// buffered events before asking the server to summarize.
let flushing = false;
export async function flushDeviceLogs(): Promise<void> {
  if (flushing) return;
  const events = readBuf();
  if (!events.length) return;
  flushing = true;
  try {
    const res = await fetch("/api/device-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
    });
    if (res.ok) writeBuf(readBuf().slice(events.length));
  } catch { /* transient — next tick retries */ }
  flushing = false;
}

export function DeviceLogBridge() {
  const { status } = useSession();
  const pathname = usePathname();
  const segRef = useRef<{ path: string; title: string; start: number } | null>(null);

  // ── segment tracking: one event per (page, continuous visible stretch) ────
  useEffect(() => {
    if (status !== "authenticated") return;

    const device = deviceLabel();
    const platform = navigator.userAgent.slice(0, 120);

    const close = () => {
      const seg = segRef.current;
      segRef.current = null;
      if (!seg) return;
      const dur = Math.round((Date.now() - seg.start) / 1000);
      if (dur < MIN_SEGMENT_S) return;
      writeBuf([...readBuf(), {
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
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", close);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", close);
      close();
    };
  }, [status, pathname]);

  // ── flush buffer + periodic AI sync ────────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated") return;

    const beacon = () => {
      const events = readBuf();
      if (!events.length) return;
      const ok = navigator.sendBeacon?.(
        "/api/device-log",
        new Blob([JSON.stringify(events)], { type: "application/json" }),
      );
      if (ok) writeBuf([]);
    };

    const sync = async () => {
      await flushDeviceLogs();
      try {
        const res = await fetch("/api/ingest/logs", { method: "POST" });
        if (res.ok) {
          const d = await res.json().catch(() => ({}));
          if (d.changed) window.dispatchEvent(new CustomEvent("te:tasks-updated"));
        }
      } catch { /* transient */ }
    };

    const flushId = setInterval(flushDeviceLogs, FLUSH_MS);
    const syncId = setInterval(sync, SYNC_MS);
    const warmup = setTimeout(sync, 45_000); // fold in anything left from the last session
    window.addEventListener("pagehide", beacon);
    return () => {
      clearInterval(flushId);
      clearInterval(syncId);
      clearTimeout(warmup);
      window.removeEventListener("pagehide", beacon);
    };
  }, [status]);

  return null;
}
