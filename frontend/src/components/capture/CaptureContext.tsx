"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { useSession } from "next-auth/react";
import { dataInsert } from "@/lib/dataClient";
import { getConsent } from "@/lib/consent";

export type ConvType = "meeting" | "brainstorm" | "work" | "personal" | "learning" | "other";

export interface Task { title: string; priority?: string; due_date?: string; }
export interface Reminder { text: string; when?: string; }

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
  savedTasks: Set<number>;
  sessions: Session[];
  start: () => void;
  stop: () => void;
  extract: (force?: boolean) => Promise<void>;
  addTask: (i: number) => Promise<void>;
  endSession: () => void;
  deleteSession: (id: string) => void;
}

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
  const [savedTasks, setSavedTasks] = useState<Set<number>>(new Set());
  const [sessions, setSessions] = useState<Session[]>([]);

  const recRef = useRef<any>(null);
  const activeRef = useRef(false);
  const transcriptRef = useRef("");
  const lastExtractLenRef = useRef(0);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    const SR = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setSupported(!!SR);
    setSessions(loadSessions());
  }, []);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

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
        setTasks((prev) => {
          const seen = new Set(prev.map((t) => t.title.toLowerCase()));
          return [...prev, ...(d.tasks || []).filter((t: Task) => t.title && !seen.has(t.title.toLowerCase()))];
        });
        setReminders((prev) => {
          const seen = new Set(prev.map((r) => r.text.toLowerCase()));
          return [...prev, ...(d.reminders || []).filter((r: Reminder) => r.text && !seen.has(r.text.toLowerCase()))];
        });
        setIdeas((prev) => uniq([...prev, ...(d.ideas || [])]));
      }
    } catch { /* transient — keep listening */ }
    setAnalyzing(false);
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    try { recRef.current?.abort(); } catch { /* noop */ }
    recRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  // Continuous recognition with auto-restart (browsers time out ~60s).
  const start = useCallback(() => {
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass || activeRef.current) return;
    activeRef.current = true;
    setListening(true);
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
        if (finalTxt) setTranscript((prev) => (prev + finalTxt).slice(-20000));
        setInterim(interimTxt);
      };
      rec.onerror = (e: any) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") stop(); };
      rec.onend = () => { setInterim(""); if (activeRef.current) setTimeout(launch, 300); };
      try { rec.start(); } catch { setTimeout(launch, 500); }
    };
    launch();
  }, [stop]);

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

  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  const addTask = useCallback(async (i: number) => {
    const t = tasks[i];
    if (!t) return;
    const row = {
      id: crypto.randomUUID(),
      title: t.title,
      status: "todo",
      priority: (["low", "medium", "high", "urgent"].includes(t.priority || "") ? t.priority : "medium"),
      due_date: t.due_date || undefined,
      created_at: new Date().toISOString(),
      source_type: "Voice",
      source_detail: "Live Capture",
    };
    await dataInsert("tasks", row).catch(() => {});
    window.dispatchEvent(new CustomEvent("te:tasks-updated"));
    setSavedTasks((prev) => new Set(prev).add(i));
  }, [tasks]);

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
    setInterim(""); setType("other"); setSummary("");
    setTasks([]); setReminders([]); setIdeas([]); setSavedTasks(new Set());
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
    tasks, reminders, ideas, savedTasks, sessions,
    start, stop, extract, addTask, endSession, deleteSession,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCapture(): CaptureValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCapture must be used within CaptureProvider");
  return v;
}
