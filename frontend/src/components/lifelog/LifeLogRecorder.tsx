"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Radio, X } from "lucide-react";
import { loadDay, saveDay, syncFromCloud } from "@/lib/lifelog/store";
import { localDateKey, type DayLog, type LogEvent, type LogSegment, type SavedAction } from "@/lib/lifelog/types";
import { LIVE_SYNC } from "@/lib/liveSync";
import { useDayRecorder, type DayRecorder } from "@/hooks/useDayRecorder";

// The day recorder lives in the app shell so listening carries on across every
// page, not only on /lifelog. "Always listen" is the person's own switch: it
// resumes on the next visit, a reminder that the mic is on comes every
// REMIND_MS, and one tap on that reminder (or the pill) turns it off.

export const LIFELOG_UPDATED = "te:lifelog-updated";
const LISTEN_KEY = "te_lifelog_always_listen";
const REMIND_MS = 30 * 60_000;
const EXTRACT_EVERY = 3;

export const alwaysListen = () => { try { return localStorage.getItem(LISTEN_KEY) === "1"; } catch { return false; } };
const setAlwaysListen = (on: boolean) => { try { if (on) localStorage.setItem(LISTEN_KEY, "1"); else localStorage.removeItem(LISTEN_KEY); } catch { /* noop */ } };

const clock = (ts: number) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
type NativeStatus = { on?: boolean; running?: boolean; lastChunkAt?: number; error?: string | null };
type Native = { startListening: () => Promise<unknown>; stopListening: () => Promise<unknown>; listeningStatus: () => Promise<NativeStatus> };
// The Android app records natively (ListenService), so listening keeps going
// with the screen off and after the app is closed; its chunks are filed on the
// server and reach this view through the cloud sync.
const native = (): Native | null => {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string; Plugins?: Record<string, unknown> } }).Capacitor;
  const p = cap?.getPlatform?.() === "android" ? cap.Plugins?.DeviceControl as Partial<Native> | undefined : undefined;
  return p?.startListening && p.listeningStatus ? p as Native : null;
};

const STATUS_MS = 5_000;

// The computer listener (public/wake) answers here while it logs the day, so
// an open tab on the same computer doesn't record it a second time.
// Asked only on a computer where the listener was set up: Chrome shows a
// "access other apps and services on this device" prompt for every such check.
const HELPER = "http://127.0.0.1:47321/status";
export const LISTENER_HERE = "te_computer_listener";
const helperLogging = () => {
  try { if (localStorage.getItem(LISTENER_HERE) !== "1") return Promise.resolve(false); } catch { return Promise.resolve(false); }
  return fetch(HELPER, { signal: AbortSignal.timeout(800) }).then((r) => r.json()).then((j: { logging?: boolean }) => !!j.logging).catch(() => false);
};

function useNativeDayRecorder(on: boolean): DayRecorder {
  const [st, setSt] = useState<NativeStatus>({});
  const seen = useRef(0);
  const poll = useCallback(async () => {
    const p = native();
    if (!p) return;
    const next = await p.listeningStatus().catch(() => ({} as NativeStatus));
    setSt(next);
    if (next.lastChunkAt && next.lastChunkAt !== seen.current) {
      seen.current = next.lastChunkAt;
      await syncFromCloud();
      window.dispatchEvent(new CustomEvent(LIFELOG_UPDATED, { detail: localDateKey(new Date()) }));
    }
  }, []);
  useEffect(() => {
    if (!on) return;
    void poll();
    const t = setInterval(poll, STATUS_MS);
    return () => clearInterval(t);
  }, [on, poll]);
  return {
    recording: Boolean(st.on),
    lastAt: st.lastChunkAt || null,
    error: st.error ?? null,
    start: async () => { await native()?.startListening().catch(() => {}); await poll(); },
    stop: () => { void native()?.stopListening().catch(() => {}).then(poll); setSt((x) => ({ ...x, on: false })); },
  };
}

const key = (a: SavedAction) => `${a.type}|${a.title.toLowerCase()}`;

function notify(title: string, body: string, tag: string, onClick?: () => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag, icon: "/icon-192.png" });
    n.onclick = () => { window.focus(); onClick?.(); n.close(); };
  } catch { /* some mobile browsers only notify from a service worker */ }
}

// The day's transcript -> timeline, summary and follow-ups. Follow-ups are saved
// as tasks/reminders on the server; anything only the person can do is announced.
export async function extractDay(date: string, go: (path: string) => void): Promise<string | null> {
  const target = loadDay(date);
  const transcript = target.segments.filter((s) => s.transcript).map((s) => `[${clock(s.startTs)}] ${s.transcript}`).join("\n");
  if (transcript.trim().length < 20) return null;
  try {
    const res = await fetch("/api/tools/lifelog/extract", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, date, tzOffset: new Date().getTimezoneOffset() }),
    });
    const d = await res.json().catch(() => ({}));
    // A failed extraction must never replace the timeline that is already saved.
    if (!res.ok || d.error || !Array.isArray(d.events)) return d.error ?? "Couldn't build the timeline right now. Your recordings are safe; try again shortly.";
    const base = target.segments[0]?.startTs ?? Date.now();
    const span = ((target.segments[target.segments.length - 1]?.endTs ?? base) - base) || 1;
    const events: LogEvent[] = d.events.map((e: any, idx: number) => ({
      id: crypto.randomUUID(),
      ts: e.time ? new Date(`${date}T${e.time.padStart(5, "0")}:00`).getTime() : base + Math.round((idx / Math.max(1, d.events.length)) * span),
      title: e.title, kind: e.kind || "other", detail: e.detail,
    })).sort((a: LogEvent, b: LogEvent) => a.ts - b.ts);
    const merged: DayLog = { ...loadDay(date), events };
    if (d.summary) merged.summary = d.summary;
    const known = new Set((merged.actions ?? []).map(key));
    const fresh = (Array.isArray(d.actions) ? d.actions as SavedAction[] : []).filter((a) => !known.has(key(a)));
    merged.actions = [...(merged.actions ?? []), ...fresh];
    saveDay(merged);
    window.dispatchEvent(new CustomEvent(LIFELOG_UPDATED, { detail: date }));
    if (fresh.some((a) => a.saved)) window.dispatchEvent(new CustomEvent("te:tasks-updated"));
    const mine = fresh.filter((a) => a.needsYou);
    const auto = fresh.filter((a) => !a.needsYou && a.saved);
    if (mine.length) notify("Needs you", mine.map((a) => a.title).join(" · "), "lifelog-needs-you", () => go("/tasks"));
    else if (auto.length) notify("JARVIS is on it", `${auto.length} follow-up${auto.length === 1 ? "" : "s"} from your day added to Tasks.`, "lifelog-auto", () => go("/tasks"));
    return null;
  } catch { return "Couldn't reach the server. Your timeline is unchanged."; }
}

interface Ctx { rec: DayRecorder; listen: () => void; stopListening: () => void; extracting: boolean; extractError: string | null; extract: (date: string) => Promise<void> }
const LifeLogCtx = createContext<Ctx | null>(null);
export const useLifeLog = () => useContext(LifeLogCtx)!;

export function LifeLogRecorderProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const newSegs = useRef(0);

  const extract = useCallback(async (date: string) => {
    setExtracting(true);
    setExtractError(await extractDay(date, router.push));
    setExtracting(false);
  }, [router]);

  // Recording always logs the real current day, whichever day is on screen.
  const onSegment = useCallback((seg: LogSegment) => {
    const today = localDateKey(new Date());
    const d = loadDay(today);
    d.segments = [...d.segments, seg];
    saveDay(d);
    window.dispatchEvent(new CustomEvent(LIFELOG_UPDATED, { detail: today }));
    if (seg.transcript && ++newSegs.current >= EXTRACT_EVERY) { newSegs.current = 0; void extract(today); }
  }, [extract]);

  const [isNative, setIsNative] = useState(false);
  useEffect(() => setIsNative(native() !== null), []);
  const webRec = useDayRecorder(onSegment);
  const nativeRec = useNativeDayRecorder(isNative);
  const rec = isNative ? nativeRec : webRec;
  const recRef = useRef(rec);
  recRef.current = rec;

  const stopListening = useCallback(() => {
    setAlwaysListen(false);
    recRef.current.stop();
    newSegs.current = 0;
    void extract(localDateKey(new Date()));
  }, [extract]);

  const listen = useCallback(() => {
    setAlwaysListen(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission().catch(() => {});
    void recRef.current.start();
  }, []);

  // Listening carries on until the person stops it: whenever the app comes
  // back (reopened, unlocked, back online), it picks up again by itself.
  useEffect(() => {
    if (status !== "authenticated") return;
    const resume = async () => {
      if (!alwaysListen() || recRef.current.recording || document.visibilityState !== "visible") return;
      // "Always listen" follows the account: switched on on another device,
      // the Android app starts its own service here too.
      if (native()) { await recRef.current.start(); return; }
      if (await helperLogging()) return;
      void recRef.current.start();
    };
    void resume();
    const stop = () => stopListening();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("te:stop-listening", stop);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("te:stop-listening", stop);
    };
  }, [status, stopListening]);

  // Chunks filed by the phone or the computer listener, and timelines rebuilt
  // on the server, reach this device on every live-sync tick.
  useEffect(() => {
    if (status !== "authenticated") return;
    const pull = () => void syncFromCloud().then(() => window.dispatchEvent(new CustomEvent(LIFELOG_UPDATED, { detail: localDateKey(new Date()) })));
    window.addEventListener(LIVE_SYNC, pull);
    return () => window.removeEventListener(LIVE_SYNC, pull);
  }, [status]);

  // In a browser a locked phone stops the mic, so the screen is kept awake
  // while listening (the Android app's service covers that there instead).
  useEffect(() => {
    if (!rec.recording || native() || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const take = async () => {
      if (document.visibilityState !== "visible") return;
      try { lock = await (navigator as unknown as { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen"); } catch { /* battery saver or unsupported */ }
    };
    void take();
    document.addEventListener("visibilitychange", take);
    return () => { document.removeEventListener("visibilitychange", take); void lock?.release().catch(() => {}); };
  }, [rec.recording]);

  useEffect(() => {
    if (!rec.recording) return;
    const t = setInterval(() => notify(
      "JARVIS is listening",
      "Logging your day and picking up tasks and reminders. Tap to turn listening off.",
      "lifelog-listening",
      stopListening,
    ), REMIND_MS);
    return () => clearInterval(t);
  }, [rec.recording, stopListening]);

  return (
    <LifeLogCtx.Provider value={{ rec, listen, stopListening, extracting, extractError, extract }}>
      {children}
      {rec.recording && <ListeningPill onStop={stopListening} />}
    </LifeLogCtx.Provider>
  );
}

function ListeningPill({ onStop }: { onStop: () => void }) {
  const path = usePathname();
  if (path?.startsWith("/lifelog")) return null;
  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-border-default bg-background-surface/95 backdrop-blur px-3 py-1.5 text-xs shadow-lg" role="status">
      <Radio size={12} className="text-accent-red animate-pulse" />
      <Link href="/lifelog" className="text-text-secondary hover:text-text-primary">Listening</Link>
      <button onClick={onStop} className="inline-flex items-center gap-1 text-text-muted hover:text-accent-red" aria-label="Turn listening off"><X size={12} /> Turn off</button>
    </div>
  );
}
