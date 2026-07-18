"use client";

import { useState } from "react";
import {
  Mic, MicOff, Loader2, CheckSquare, Bell, Lightbulb, Plus, Check,
  Radio, Trash2,
} from "lucide-react";
import { ConvType, useCapture } from "./CaptureContext";

const TYPE_META: Record<ConvType, { label: string; color: string }> = {
  meeting:    { label: "Meeting",    color: "#4F8EF7" },
  brainstorm: { label: "Brainstorm", color: "#A78BFA" },
  work:       { label: "Work",       color: "#4FC3F7" },
  personal:   { label: "Personal",   color: "#34D399" },
  learning:   { label: "Learning",   color: "#F0C94E" },
  other:      { label: "Other",      color: "#7878A8" },
};

export function CaptureClient() {
  const {
    supported, listening, analyzing, transcript, interim, type, summary,
    tasks, reminders, ideas, savedTasks, sessions,
    start, extract, addTask, endSession, deleteSession,
  } = useCapture();
  const [filter, setFilter] = useState<ConvType | "all">("all");

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
