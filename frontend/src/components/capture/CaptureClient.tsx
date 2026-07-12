"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Loader2, CheckSquare, Bell, Lightbulb, Plus, Check,
  Radio, Trash2,
} from "lucide-react";
import { dataInsert } from "@/lib/dataClient";

type ConvType = "meeting" | "brainstorm" | "work" | "personal" | "learning" | "other";

interface Task { title: string; priority?: string; due_date?: string; }
interface Reminder { text: string; when?: string; }

interface Session {
  id: string;
  started_at: string;
  type: ConvType;
  summary: string;
  transcript: string;
  tasks: Task[];
  reminders: Reminder[];
  ideas: string[];
}

const KEY = "jarvis_capture_sessions_v1";
const TYPE_META: Record<ConvType, { label: string; color: string }> = {
  meeting:    { label: "Meeting",    color: "#4F8EF7" },
  brainstorm: { label: "Brainstorm", color: "#A78BFA" },
  work:       { label: "Work",       color: "#4FC3F7" },
  personal:   { label: "Personal",   color: "#34D399" },
  learning:   { label: "Learning",   color: "#F0C94E" },
  other:      { label: "Other",      color: "#7878A8" },
};

function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function saveSessions(v: Session[]) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* noop */ } }

const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

export function CaptureClient() {
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
  const [filter, setFilter] = useState<ConvType | "all">("all");

  const recRef = useRef<any>(null);
  const activeRef = useRef(false);
  const transcriptRef = useRef("");
  const lastExtractLenRef = useRef(0);

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
        // Merge, de-duplicating by title/text.
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    activeRef.current = false;
    try { recRef.current?.abort(); } catch { /* noop */ }
    recRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  // Periodic extraction while listening.
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => { if (!analyzing) extract(false); }, 20000);
    return () => clearInterval(id);
  }, [listening, analyzing, extract]);

  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  async function addTask(i: number) {
    const t = tasks[i];
    const row = {
      id: crypto.randomUUID(),
      title: t.title,
      status: "todo",
      priority: (["low", "medium", "high", "urgent"].includes(t.priority || "") ? t.priority : "medium"),
      due_date: t.due_date || undefined,
      created_at: new Date().toISOString(),
    };
    await dataInsert("tasks", row).catch(() => {});
    setSavedTasks((prev) => new Set(prev).add(i));
  }

  function endSession() {
    stop();
    const text = transcriptRef.current.trim();
    if (text && (tasks.length || reminders.length || ideas.length || summary)) {
      const s: Session = {
        id: crypto.randomUUID(), started_at: new Date().toISOString(),
        type, summary, transcript: text, tasks, reminders, ideas,
      };
      const next = [s, ...sessions].slice(0, 100);
      setSessions(next); saveSessions(next);
    }
    // reset live state
    setTranscript(""); transcriptRef.current = ""; lastExtractLenRef.current = 0;
    setInterim(""); setType("other"); setSummary("");
    setTasks([]); setReminders([]); setIdeas([]); setSavedTasks(new Set());
  }

  function deleteSession(id: string) {
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next); saveSessions(next);
  }

  const shownSessions = filter === "all" ? sessions : sessions.filter((s) => s.type === filter);

  return (
    <div className="space-y-6">
      {/* Control bar */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          {!supported ? (
            <p className="text-sm text-accent-red">Live transcription needs the Web Speech API — try Chrome or Edge.</p>
          ) : !listening ? (
            <button onClick={start} className="flex items-center gap-2 px-4 py-2.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-sm font-semibold hover:brightness-110">
              <Mic size={16} /> Start listening
            </button>
          ) : (
            <>
              <span className="flex items-center gap-2 text-accent-red text-sm font-medium">
                <Radio size={16} className="animate-pulse" /> Listening…
              </span>
              <button onClick={() => extract(true)} disabled={analyzing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-input border border-[#4FC3F7]/40 bg-[#4FC3F7]/10 text-[#4FC3F7] text-xs font-mono uppercase tracking-wider hover:bg-[#4FC3F7]/20 disabled:opacity-40">
                {analyzing ? <Loader2 size={13} className="animate-spin" /> : <CheckSquare size={13} />} Analyze now
              </button>
              <button onClick={endSession}
                className="flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default text-text-secondary text-xs hover:text-text-primary">
                <MicOff size={14} /> Stop &amp; save session
              </button>
            </>
          )}
          {summary && (
            <span className="ml-auto flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full border text-[11px]" style={{ borderColor: TYPE_META[type].color, color: TYPE_META[type].color }}>{TYPE_META[type].label}</span>
              <span className="text-text-muted max-w-[40ch] truncate">{summary}</span>
            </span>
          )}
        </div>

        {/* Live transcript */}
        {(transcript || interim) && (
          <div className="mt-4 max-h-40 overflow-y-auto rounded-input bg-background-base border border-border-default p-3 text-sm text-text-secondary leading-relaxed">
            {transcript}<span className="text-text-muted italic">{interim}</span>
          </div>
        )}
      </div>

      {/* Extracted, live */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Column icon={<CheckSquare size={14} />} label="Tasks" color="#4FC3F7" count={tasks.length}>
          {tasks.map((t, i) => (
            <div key={i} className="flex items-start gap-2 py-2 border-b border-border-default last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary">{t.title}</div>
                <div className="text-[11px] text-text-muted font-mono">{t.priority || "medium"}{t.due_date ? ` · ${t.due_date}` : ""}</div>
              </div>
              <button onClick={() => addTask(i)} disabled={savedTasks.has(i)}
                title="Add to Task Tracker"
                className={savedTasks.has(i) ? "text-emerald-400 flex-none" : "text-text-muted hover:text-[#4FC3F7] flex-none"}>
                {savedTasks.has(i) ? <Check size={15} /> : <Plus size={15} />}
              </button>
            </div>
          ))}
        </Column>
        <Column icon={<Bell size={14} />} label="Reminders" color="#F0C94E" count={reminders.length}>
          {reminders.map((r, i) => (
            <div key={i} className="py-2 border-b border-border-default last:border-0">
              <div className="text-sm text-text-primary">{r.text}</div>
              {r.when && <div className="text-[11px] text-text-muted font-mono">{r.when}</div>}
            </div>
          ))}
        </Column>
        <Column icon={<Lightbulb size={14} />} label="Ideas" color="#A78BFA" count={ideas.length}>
          {ideas.map((idea, i) => (
            <div key={i} className="py-2 border-b border-border-default last:border-0 text-sm text-text-primary">{idea}</div>
          ))}
        </Column>
      </div>

      {/* Past sessions, categorized */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="hud-label text-text-muted">Sessions</div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...Object.keys(TYPE_META)] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f as ConvType | "all")}
                className={`px-2 py-1 rounded-full text-[11px] border ${filter === f ? "border-[#4FC3F7] text-[#4FC3F7] bg-[#4FC3F7]/10" : "border-border-default text-text-muted"}`}>
                {f === "all" ? "All" : TYPE_META[f as ConvType].label}
              </button>
            ))}
          </div>
        </div>
        {shownSessions.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No saved sessions yet. Start listening, then “Stop &amp; save”.</p>
        ) : (
          <div className="space-y-2">
            {shownSessions.map((s) => (
              <div key={s.id} className="rounded-input border border-border-default bg-background-base p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-full border text-[10px] flex-none" style={{ borderColor: TYPE_META[s.type].color, color: TYPE_META[s.type].color }}>{TYPE_META[s.type].label}</span>
                  <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{s.summary || "(no summary)"}</span>
                  <span className="text-[11px] text-text-muted font-mono flex-none">{new Date(s.started_at).toLocaleString()}</span>
                  <button onClick={() => deleteSession(s.id)} className="text-text-muted hover:text-rose-400 flex-none"><Trash2 size={13} /></button>
                </div>
                <div className="text-[11px] text-text-muted font-mono">{s.tasks.length} tasks · {s.reminders.length} reminders · {s.ideas.length} ideas</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Column({ icon, label, color, count, children }: { icon: React.ReactNode; label: string; color: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4">
      <div className="flex items-center gap-2 mb-2" style={{ color }}>
        {icon}<span className="hud-label" style={{ color }}>{label}</span>
        <span className="ml-auto text-xs font-mono text-text-muted">{count}</span>
      </div>
      {count === 0 ? <p className="text-xs text-text-muted py-3">Nothing yet.</p> : <div>{children}</div>}
    </div>
  );
}
