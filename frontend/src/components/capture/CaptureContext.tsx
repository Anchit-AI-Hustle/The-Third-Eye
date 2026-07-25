"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { useSession } from "next-auth/react";
import { dataInsert, dataDelete } from "@/lib/dataClient";
import { getConsent } from "@/lib/consent";
import { matchSystemsCommand } from "@/lib/systems";
import { logAgentAction } from "@/lib/agentControl";

export type ConvType = "meeting" | "brainstorm" | "work" | "personal" | "learning" | "other";

export interface Task { title: string; priority?: string; due_date?: string; }
export interface Reminder { text: string; when?: string; }
// A task the assistant auto-created in the Tracker from live speech — kept so
// the user can see what was added and undo it.
export interface AutoAdded { rowId: string; title: string; at: string; }

export interface Session {
  id: string;
  started_at: string;
  type: ConvType;
  summary: string;
  transcript: string;
  tasks: Task[];
  reminders: Reminder[];
  ideas: string[];
}

interface CaptureValue {
  supported: boolean;
  listening: boolean;
  analyzing: boolean;
  transcript: string;
  interim: string;
  type: ConvType;
  summary: string;
  tasks: Task[];
  reminders: Reminder[];
  ideas: string[];
  savedTitles: Set<string>;
  sessions: Session[];
  autoCreate: boolean;
  setAutoCreate: (v: boolean) => void;
  autoAdded: AutoAdded[];
  wakeActive: boolean;
  start: () => void;
  stop: () => void;
  extract: (force?: boolean) => Promise<void>;
  addTask: (i: number) => Promise<void>;
  undoAutoAdd: (rowId: string) => Promise<void>;
  endSession: () => void;
  deleteSession: (id: string) => void;
}

const norm = (s: string) => s.toLowerCase().trim();

const KEY = "jarvis_capture_sessions_v1";
const Ctx = createContext<CaptureValue | null>(null);

function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function saveSessions(v: Session[]) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* noop */ } }

const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [type, setType] = useState<ConvType>("other");
  const [summary, setSummary] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [autoCreate, setAutoCreateState] = useState(true);
  const [autoAdded, setAutoAdded] = useState<AutoAdded[]>([]);
  const [wakeActive, setWakeActive] = useState(false);

  const recRef = useRef<any>(null);
  const activeRef = useRef(false);
  const transcriptRef = useRef("");
  const lastExtractLenRef = useRef(0);
  const autoStartedRef = useRef(false);
  const autoCreateRef = useRef(true);
  const seenTaskRef = useRef<Set<string>>(new Set()); // titles seen this session (display + persist dedup)
  const wakeRef = useRef<any>(null);

  useEffect(() => {
    const SR = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setSupported(!!SR);
    setSessions(loadSessions());
    const pref = localStorage.getItem("te_capture_autocreate");
    const on = pref === null ? true : pref === "1";
    setAutoCreateState(on); autoCreateRef.current = on;
  }, []);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const setAutoCreate = useCallback((v: boolean) => {
    setAutoCreateState(v); autoCreateRef.current = v;
    try { localStorage.setItem("te_capture_autocreate", v ? "1" : "0"); } catch { /* noop */ }
  }, []);

  // Screen Wake Lock: keep the display awake during an active capture session so
  // the browser doesn't suspend the mic mid-session. NOTE: this does NOT enable
  // background/screen-off recording — the web platform has no API for that.
  const acquireWake = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        wakeRef.current = await (navigator as any).wakeLock.request("screen");
        setWakeActive(true);
        wakeRef.current?.addEventListener?.("release", () => setWakeActive(false));
      }
    } catch { setWakeActive(false); }
  }, []);
  const releaseWake = useCallback(async () => {
    try { await wakeRef.current?.release?.(); } catch { /* noop */ }
    wakeRef.current = null; setWakeActive(false);
  }, []);

  // Build a Tracker row from a captured task (shared by manual + auto add).
  const buildRow = useCallback((t: Task, auto: boolean) => ({
    id: crypto.randomUUID(),
    title: t.title,
    status: "todo",
    priority: (["low", "medium", "high", "urgent"].includes(t.priority || "") ? t.priority : "medium"),
    due_date: t.due_date || undefined,
    created_at: new Date().toISOString(),
    source_type: "Voice",
    source_detail: auto ? "Live Capture (auto)" : "Live Capture",
  }), []);

  const extract = useCallback(async (force = false) => {
    const text = transcriptRef.current.trim();
    if (!text) return;
    if (!force && text.length - lastExtractLenRef.current < 180) return; // wait for enough new speech
    lastExtractLenRef.current = text.length;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/capture/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text.slice(-12000) }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.type) setType(d.type);
        if (d.summary) setSummary(d.summary);
        // Dedup against everything seen this session (survives state churn), then
        // append fresh tasks and — if auto-create is on — write them straight to
        // the Task Tracker with an undoable log entry.
        const fresh: Task[] = [];
        for (const t of (d.tasks || []) as Task[]) {
          if (!t.title) continue;
          const key = norm(t.title);
          if (seenTaskRef.current.has(key)) continue;
          seenTaskRef.current.add(key);
          fresh.push(t);
        }
        if (fresh.length) {
          setTasks((prev) => [...prev, ...fresh]);
          try { logAgentAction({ type: "capture.extract", label: `Captured ${fresh.length} task${fresh.length > 1 ? "s" : ""} from voice`, outcome: "applied" }); } catch { /* noop */ }
          if (autoCreateRef.current) {
            for (const t of fresh) {
              const row = buildRow(t, true);
              try {
                await dataInsert("tasks", row);
                setSavedTitles((prev) => new Set(prev).add(norm(t.title)));
                setAutoAdded((prev) => [{ rowId: row.id, title: t.title, at: row.created_at }, ...prev].slice(0, 50));
              } catch { /* keep listening; user can add manually */ }
            }
            window.dispatchEvent(new CustomEvent("te:tasks-updated"));
          }
        }
        setReminders((prev) => {
          const seen = new Set(prev.map((r) => r.text.toLowerCase()));
          return [...prev, ...(d.reminders || []).filter((r: Reminder) => r.text && !seen.has(r.text.toLowerCase()))];
        });
        setIdeas((prev) => uniq([...prev, ...(d.ideas || [])]));
      }
    } catch { /* transient — keep listening */ }
    setAnalyzing(false);
  }, [buildRow]);

  const stop = useCallback(() => {
    activeRef.current = false;
    try { recRef.current?.abort(); } catch { /* noop */ }
    recRef.current = null;
    setListening(false);
    setInterim("");
    void releaseWake();
  }, [releaseWake]);

  // Continuous recognition with auto-restart (browsers time out ~60s).
  const start = useCallback(() => {
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass || activeRef.current) return;
    activeRef.current = true;
    setListening(true);
    void acquireWake();
    const launch = () => {
      if (!activeRef.current) return;
      const rec = new SRClass();
      recRef.current = rec;
      rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
      rec.onresult = (e: any) => {
        let finalTxt = "", interimTxt = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalTxt += r[0].transcript + " ";
          else interimTxt += r[0].transcript;
        }
        if (finalTxt) {
          // Ambient voice command: "all systems online" / "<system> status".
          const cmd = matchSystemsCommand(finalTxt);
          if (cmd && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("te:systems-online", { detail: cmd }));
          }
          setTranscript((prev) => (prev + finalTxt).slice(-20000));
        }
        setInterim(interimTxt);
      };
      rec.onerror = (e: any) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") stop(); };
      rec.onend = () => { setInterim(""); if (activeRef.current) setTimeout(launch, 300); };
      try { rec.start(); } catch { setTimeout(launch, 500); }
    };
    launch();
  }, [stop, acquireWake]);

  // Re-acquire the wake lock when the tab returns to the foreground (the browser
  // auto-releases it when hidden). Recognition itself resumes via onend restart.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && activeRef.current && !wakeRef.current) void acquireWake(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [acquireWake]);

  // Auto-start as soon as the app is opened — only when signed in, the browser
  // supports it, and the user has granted microphone consent. Re-checks when
  // consent is granted via the startup dialog (consent.ts dispatches "te:consent").
  useEffect(() => {
    if (status !== "authenticated") {
      autoStartedRef.current = false;
      stop();
      return;
    }
    const tryAuto = () => {
      if (autoStartedRef.current || activeRef.current) return;
      if (!supported) return;
      if (getConsent("microphone") !== "granted") return;
      autoStartedRef.current = true;
      start();
    };
    tryAuto();
    window.addEventListener("te:consent", tryAuto);
    return () => window.removeEventListener("te:consent", tryAuto);
  }, [status, supported, start, stop]);

  // Periodic extraction while listening.
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => { if (!analyzing) extract(false); }, 20000);
    return () => clearInterval(id);
  }, [listening, analyzing, extract]);

  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* noop */ } void releaseWake(); }, [releaseWake]);

  const addTask = useCallback(async (i: number) => {
    const t = tasks[i];
    if (!t || savedTitles.has(norm(t.title))) return; // don't double-add
    const row = buildRow(t, false);
    await dataInsert("tasks", row).catch(() => {});
    window.dispatchEvent(new CustomEvent("te:tasks-updated"));
    setSavedTitles((prev) => new Set(prev).add(norm(t.title)));
    setAutoAdded((prev) => [{ rowId: row.id, title: t.title, at: row.created_at }, ...prev].slice(0, 50));
  }, [tasks, savedTitles, buildRow]);

  // Undo an auto-added (or manually-added) task: delete the Tracker row and free
  // its title so it can be added again.
  const undoAutoAdd = useCallback(async (rowId: string) => {
    const entry = autoAdded.find((a) => a.rowId === rowId);
    await dataDelete("tasks", rowId).catch(() => {});
    window.dispatchEvent(new CustomEvent("te:tasks-updated"));
    setAutoAdded((prev) => prev.filter((a) => a.rowId !== rowId));
    if (entry) setSavedTitles((prev) => { const n = new Set(prev); n.delete(norm(entry.title)); return n; });
  }, [autoAdded]);

  const endSession = useCallback(() => {
    stop();
    const text = transcriptRef.current.trim();
    if (text && (tasks.length || reminders.length || ideas.length || summary)) {
      const s: Session = {
        id: crypto.randomUUID(), started_at: new Date().toISOString(),
        type, summary, transcript: text, tasks, reminders, ideas,
      };
      setSessions((prev) => {
        const next = [s, ...prev].slice(0, 100);
        saveSessions(next);
        return next;
      });
    }
    setTranscript(""); transcriptRef.current = ""; lastExtractLenRef.current = 0;
    seenTaskRef.current = new Set();
    setInterim(""); setType("other"); setSummary("");
    setTasks([]); setReminders([]); setIdeas([]); setSavedTitles(new Set()); setAutoAdded([]);
  }, [stop, tasks, reminders, ideas, summary, type]);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSessions(next);
      return next;
    });
  }, []);

  const value: CaptureValue = {
    supported, listening, analyzing, transcript, interim, type, summary,
    tasks, reminders, ideas, savedTitles, sessions,
    autoCreate, setAutoCreate, autoAdded, wakeActive,
    start, stop, extract, addTask, undoAutoAdd, endSession, deleteSession,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCapture(): CaptureValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCapture must be used within CaptureProvider");
  return v;
}
