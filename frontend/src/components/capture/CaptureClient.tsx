"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Mic, MicOff, Loader2, CheckSquare, Bell, Lightbulb, Plus, Check,
  Radio, Trash2, Sun, Undo2, RefreshCw, Link2, AlertTriangle, Zap,
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
    tasks, reminders, ideas, savedTitles, sessions,
    autoCreate, setAutoCreate, autoAdded, wakeActive,
    start, extract, addTask, undoAutoAdd, endSession, deleteSession,
  } = useCapture();
  const [filter, setFilter] = useState<ConvType | "all">("all");

  const shownSessions = filter === "all" ? sessions : sessions.filter((s) => s.type === filter);

  return (
    <div className="space-y-6">
      {/* Email / Chat ingestion status + manual scan */}
      <IngestStatusPanel />

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

        {/* Settings row: auto-create + wake + background note */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <button onClick={() => setAutoCreate(!autoCreate)}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
            title="When on, action items detected in speech are added to the Task Tracker automatically">
            <span className={`relative w-8 h-4 rounded-full transition-colors ${autoCreate ? "bg-[#34D399]" : "bg-border-default"}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${autoCreate ? "left-4" : "left-0.5"}`} />
            </span>
            <Zap size={12} className={autoCreate ? "text-[#34D399]" : "text-text-muted"} />
            Auto-add tasks to Tracker
          </button>
          {listening && wakeActive && (
            <span className="flex items-center gap-1 text-[#F0C94E]" title="Screen kept awake during this session">
              <Sun size={12} /> Screen awake
            </span>
          )}
          <span className="text-text-muted flex items-center gap-1" title="Web browsers cannot record audio when the tab is hidden or the screen is off. For always-on background capture, use the desktop agent.">
            <AlertTriangle size={11} /> Foreground only — background capture needs the desktop app
          </span>
        </div>

        {/* Auto-added log with undo */}
        {autoAdded.length > 0 && (
          <div className="mt-3 rounded-input bg-[#34D399]/5 border border-[#34D399]/20 p-3">
            <div className="hud-label text-[#34D399] mb-2">Added to Tracker ({autoAdded.length})</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {autoAdded.map((a) => (
                <div key={a.rowId} className="flex items-center gap-2 text-xs">
                  <Check size={12} className="text-[#34D399] flex-none" />
                  <span className="text-text-secondary flex-1 min-w-0 truncate">{a.title}</span>
                  <button onClick={() => undoAutoAdd(a.rowId)}
                    className="flex items-center gap-1 text-text-muted hover:text-accent-red flex-none" title="Undo — remove from Tracker">
                    <Undo2 size={12} /> Undo
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
          {tasks.map((t, i) => {
            const saved = savedTitles.has(t.title.toLowerCase().trim());
            return (
              <div key={i} className="flex items-start gap-2 py-2 border-b border-border-default last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">{t.title}</div>
                  <div className="text-[11px] text-text-muted font-mono">{t.priority || "medium"}{t.due_date ? ` · ${t.due_date}` : ""}</div>
                </div>
                <button onClick={() => addTask(i)} disabled={saved}
                  title={saved ? "In Task Tracker" : "Add to Task Tracker"}
                  className={saved ? "text-emerald-400 flex-none" : "text-text-muted hover:text-[#4FC3F7] flex-none"}>
                  {saved ? <Check size={15} /> : <Plus size={15} />}
                </button>
              </div>
            );
          })}
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

// Surfaces WHY email/chat scraping may not be producing tasks (silent no-ops
// were the #1 cause) and lets the user trigger a scan on demand with a result.
function IngestStatusPanel() {
  const [conn, setConn] = useState<{ connected: boolean; scopes?: string[]; configured?: boolean } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/connect/google/status").then((r) => r.json()).then(setConn).catch(() => setConn(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const hasGmail = !!conn?.scopes?.some((s) => s.includes("gmail"));
  const hasChat = !!conn?.scopes?.some((s) => s.includes("chat"));

  async function scanNow() {
    setScanning(true); setResult(null);
    try {
      const res = await fetch("/api/ingest/run", { method: "POST" });
      const d = await res.json();
      if (d.skipped === "not configured") { setResult("Server storage isn't configured (Supabase). Scraping can't run."); return; }
      if (d.skipped === "cooldown") { setResult("Just scanned — try again in a moment."); return; }
      const parts: string[] = [];
      for (const [label, r] of [["Gmail", d.gmail], ["Chat", d.chat]] as const) {
        if (!r) continue;
        if (r.skipped) parts.push(`${label}: not connected`);
        else if (r.error) parts.push(`${label}: error`);
        else parts.push(`${label}: ${r.inserted ?? 0} new, ${r.merged ?? 0} merged`);
      }
      setResult(parts.join(" · ") || "Scan complete.");
      if (d.changed) window.dispatchEvent(new CustomEvent("te:tasks-updated"));
    } catch {
      setResult("Scan failed — check your connection.");
    } finally { setScanning(false); }
  }

  if (conn && conn.configured === false) {
    return (
      <div className="rounded-card border border-accent-red/30 bg-accent-red/5 p-4 text-sm text-text-secondary flex items-center gap-2">
        <AlertTriangle size={15} className="text-accent-red flex-none" />
        Cloud storage isn’t configured, so email/chat scraping and cross-device sync are off.
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="hud-label text-text-muted">Inbox &amp; Chat → Tasks</span>
        <div className="flex items-center gap-3 text-xs">
          <StatusDot on={hasGmail} label="Gmail" />
          <StatusDot on={hasChat} label="Chat" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!conn?.connected || !hasGmail || !hasChat ? (
            <a href="/api/connect/google"
              className="flex items-center gap-1.5 px-3 py-2 rounded-input bg-[#4FC3F7] text-[#07070F] text-xs font-semibold hover:brightness-110">
              <Link2 size={13} /> {conn?.connected ? "Grant Gmail + Chat" : "Connect Google"}
            </a>
          ) : null}
          <button onClick={scanNow} disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default text-text-secondary text-xs hover:text-text-primary disabled:opacity-40">
            {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Scan now
          </button>
        </div>
      </div>
      {(!conn?.connected) && (
        <p className="mt-2 text-xs text-text-muted">
          Signing in with Google doesn’t grant inbox access — connect here to let the assistant read Gmail &amp; Chat and turn them into tasks. Scans also run automatically every 15 minutes once connected.
        </p>
      )}
      {result && <p className="mt-2 text-xs text-[#4FC3F7] font-mono">{result}</p>}
    </div>
  );
}

function StatusDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-text-muted">
      <span className={`w-2 h-2 rounded-full ${on ? "bg-[#34D399]" : "bg-text-muted/40"}`} />
      {label} {on ? "" : <span className="text-text-muted/60">off</span>}
    </span>
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
