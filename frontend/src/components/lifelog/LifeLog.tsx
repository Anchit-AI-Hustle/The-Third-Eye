"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Loader2, ChevronLeft, ChevronRight, Play, Pause, Sparkles, BookHeart, Radio, Calendar as CalIcon, Clock, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { loadDay, saveDay, listDates, syncFromCloud, deleteDay } from "@/lib/lifelog/store";
import { getAudio } from "@/lib/lifelog/audioStore";
import { localDateKey, type DayLog, type LogSegment, type LogEvent } from "@/lib/lifelog/types";
import { useDayRecorder } from "@/hooks/useDayRecorder";

const KIND_COLORS: Record<string, string> = {
  meeting: "#4FC3F7", conversation: "#34D399", task: "#F0C94E",
  idea: "#A78BFA", decision: "#F472B6", note: "#94A3B8", other: "#64748B",
};
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDayTitle = (date: string) => new Date(date + "T00:00:00").toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export function LifeLog() {
  const today = useMemo(() => localDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [day, setDay] = useState<DayLog>(() => loadDay(today));
  const [dates, setDates] = useState<string[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [extracting, setExtracting] = useState(false);
  const [diaryText, setDiaryText] = useState("");
  const newSegsRef = useRef(0);

  useEffect(() => { syncFromCloud().finally(() => setDates(listDates())); }, []);
  useEffect(() => { setDay(loadDay(selectedDate)); }, [selectedDate]);

  const refreshDates = useCallback(() => setDates(listDates()), []);

  // Extraction: turn the day's transcript into a timeline + summary.
  const runExtract = useCallback(async (target: DayLog) => {
    const transcript = target.segments.filter((s) => s.transcript).map((s) => s.transcript).join("\n");
    if (transcript.trim().length < 20) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/tools/lifelog/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, date: target.date }),
      });
      const d = await res.json().catch(() => ({}));
      if (Array.isArray(d.events)) {
        const base = target.segments[0]?.startTs ?? Date.now();
        const span = ((target.segments[target.segments.length - 1]?.endTs ?? base) - base) || 1;
        const fresh: LogEvent[] = d.events.map((e: any, idx: number) => ({
          id: crypto.randomUUID(),
          ts: base + Math.round((idx / Math.max(1, d.events.length)) * span),
          title: e.title, kind: e.kind || "other", detail: e.detail,
        }));
        const merged = { ...loadDay(target.date) };
        merged.events = fresh;               // extraction returns the full timeline
        if (d.summary) merged.summary = d.summary;
        saveDay(merged);
        if (merged.date === selectedDate) setDay(merged);
        refreshDates();
      }
    } catch { /* leave existing timeline */ }
    finally { setExtracting(false); }
  }, [selectedDate, refreshDates]);

  // A recorded chunk arrived → append to TODAY's log (recording always logs the
  // real current day, even if the user is viewing a past day).
  const onSegment = useCallback((seg: LogSegment) => {
    const t = localDateKey(new Date());
    const d = loadDay(t);
    d.segments = [...d.segments, seg];
    saveDay(d);
    if (t === selectedDate) setDay(d);
    refreshDates();
    if (seg.transcript) {
      newSegsRef.current += 1;
      if (newSegsRef.current >= 3) { newSegsRef.current = 0; void runExtract(loadDay(t)); }
    }
  }, [selectedDate, refreshDates, runExtract]);

  const rec = useDayRecorder(onSegment);

  const toggleRecord = useCallback(() => {
    if (rec.recording) {
      rec.stop();
      newSegsRef.current = 0;
      void runExtract(loadDay(localDateKey(new Date()))); // final pass on stop
    } else {
      setSelectedDate(localDateKey(new Date())); // jump to today when recording
      void rec.start();
    }
  }, [rec, runExtract]);

  const addDiary = useCallback(() => {
    const text = diaryText.trim();
    if (!text) return;
    const d = loadDay(selectedDate);
    d.diary = [...d.diary, { id: crypto.randomUUID(), ts: Date.now(), text }];
    saveDay(d); setDay(d); setDiaryText(""); refreshDates();
  }, [diaryText, selectedDate, refreshDates]);

  const removeDay = useCallback(async () => {
    if (!confirm(`Delete the entire log for ${selectedDate}? This removes its audio, transcript, timeline and diary.`)) return;
    await deleteDay(selectedDate);
    setDates(listDates());
    setDay(loadDay(selectedDate));
  }, [selectedDate]);

  // Timeline = extracted events + diary entries, merged and time-ordered.
  const timeline = useMemo(() => {
    const items = [
      ...day.events.map((e) => ({ kind: "event" as const, ts: e.ts, ev: e })),
      ...day.diary.map((e) => ({ kind: "diary" as const, ts: e.ts, di: e })),
    ];
    return items.sort((a, b) => a.ts - b.ts);
  }, [day]);

  const transcriptText = day.segments.filter((s) => s.transcript).map((s) => `[${fmtTime(s.startTs)}] ${s.transcript}`).join("\n");
  const audioSegs = day.segments.filter((s) => s.hasAudio);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
      {/* Left: recorder + calendar */}
      <div className="space-y-4">
        <div className="rounded-card border border-border-default bg-background-surface/40 p-4 space-y-3">
          <div className="flex items-center gap-2"><Radio size={15} className={rec.recording ? "text-accent-red animate-pulse" : "text-[#34D399]"} /><span className="hud-label text-[#34D399]">Recorder</span></div>
          <button onClick={toggleRecord}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold transition-all ${rec.recording ? "bg-accent-red/15 text-accent-red border border-accent-red/30 hover:bg-accent-red/25" : "text-[#07070F] bg-[#34D399] hover:brightness-110"}`}>
            {rec.recording ? <><Square size={14} /> Stop recording</> : <><Mic size={15} /> Start recording the day</>}
          </button>
          {rec.recording && <p className="text-[11px] font-mono text-text-muted flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" /> Listening · {day.segments.length} segment{day.segments.length === 1 ? "" : "s"}{rec.lastAt ? ` · last ${fmtTime(rec.lastAt)}` : ""}</p>}
          {rec.error && <p className="text-[11px] text-accent-red flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-none" />{rec.error}</p>}
          <p className="text-[10px] text-text-muted leading-relaxed">Records while this screen is open. Phones pause the mic when the app is in the background or the screen is locked — keep it foregrounded for a continuous log.</p>
        </div>

        <CalendarCard cursor={monthCursor} setCursor={setMonthCursor} selected={selectedDate} today={today} dates={dates} onPick={setSelectedDate} />
      </div>

      {/* Right: the selected day */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-5 min-h-[520px] space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[#34D399]"><CalIcon size={15} /><span className="hud-label text-[#34D399]">{selectedDate === today ? "Today" : "Day view"}</span></div>
            <h2 className="font-display text-lg font-semibold text-text-primary mt-0.5">{fmtDayTitle(selectedDate)}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => runExtract(loadDay(selectedDate))} disabled={extracting || !day.segments.some((s) => s.transcript)} title="Re-summarise the day"
              className="p-1.5 rounded-input border border-border-default text-text-muted hover:text-[#34D399] disabled:opacity-40">
              {extracting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
            {(day.segments.length > 0 || day.diary.length > 0) && (
              <button onClick={removeDay} title="Delete this day" className="p-1.5 rounded-input border border-border-default text-text-muted hover:text-accent-red"><Trash2 size={13} /></button>
            )}
          </div>
        </div>

        {day.summary && (
          <div className="rounded-input border border-[#34D399]/20 bg-[#34D399]/[0.04] p-3">
            <div className="flex items-center gap-1.5 mb-1"><Sparkles size={12} className="text-[#34D399]" /><span className="hud-label text-[#34D399]">Day summary</span></div>
            <p className="text-sm text-text-secondary leading-relaxed">{day.summary}</p>
          </div>
        )}

        {/* Timeline */}
        <div>
          <span className="hud-label text-text-muted flex items-center gap-1.5"><Clock size={12} /> Timeline</span>
          {timeline.length === 0 ? (
            <p className="text-sm text-text-muted mt-2">Nothing logged yet. Start recording, or add a diary note below.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {timeline.map((it, idx) => it.kind === "event" ? (
                <div key={idx} className="flex items-start gap-2.5">
                  <span className="text-[10px] font-mono text-text-muted w-11 flex-none pt-0.5">{fmtTime(it.ts)}</span>
                  <span className="w-2 h-2 rounded-full flex-none mt-1.5" style={{ background: KIND_COLORS[it.ev!.kind] || KIND_COLORS.other }} />
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary">{it.ev!.title} <span className="text-[10px] font-mono uppercase text-text-muted">· {it.ev!.kind}</span></p>
                    {it.ev!.detail && <p className="text-xs text-text-muted">{it.ev!.detail}</p>}
                  </div>
                </div>
              ) : (
                <div key={idx} className="flex items-start gap-2.5">
                  <span className="text-[10px] font-mono text-text-muted w-11 flex-none pt-0.5">{fmtTime(it.ts)}</span>
                  <BookHeart size={13} className="text-[#F472B6] flex-none mt-1" />
                  <p className="text-sm text-text-secondary italic">{it.di!.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audio segments */}
        {audioSegs.length > 0 && (
          <div>
            <span className="hud-label text-text-muted">Audio ({audioSegs.length})</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {audioSegs.map((s) => <AudioChip key={s.id} seg={s} />)}
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcriptText && (
          <details className="group">
            <summary className="hud-label text-text-muted cursor-pointer select-none">Full transcript ▾</summary>
            <pre className="mt-2 text-xs text-text-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">{transcriptText}</pre>
          </details>
        )}

        {/* Dear Diary */}
        <div className="pt-1">
          <span className="hud-label text-text-muted flex items-center gap-1.5"><BookHeart size={12} className="text-[#F472B6]" /> Dear diary</span>
          <textarea value={diaryText} onChange={(e) => setDiaryText(e.target.value)} rows={3}
            placeholder={`Write about ${selectedDate === today ? "today" : "this day"}…`}
            className="mt-2 w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[#F472B6]/50 resize-y" />
          <button onClick={addDiary} disabled={!diaryText.trim()}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input text-xs font-medium text-[#F472B6] border border-[#F472B6]/30 hover:bg-[#F472B6]/10 disabled:opacity-40">
            <BookHeart size={12} /> Add entry
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarCard({ cursor, setCursor, selected, today, dates, onPick }: {
  cursor: Date; setCursor: (d: Date) => void; selected: string; today: string; dates: string[]; onPick: (d: string) => void;
}) {
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const has = new Set(dates);
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  const monthLabel = first.toLocaleDateString([], { month: "long", year: "numeric" });
  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1 rounded-input text-text-muted hover:text-text-primary"><ChevronLeft size={16} /></button>
        <span className="text-sm font-medium text-text-primary">{monthLabel}</span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1 rounded-input text-text-muted hover:text-text-primary"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="text-[10px] font-mono text-text-muted py-1">{d}</span>)}
        {cells.map((date, i) => date === null ? <span key={i} /> : (
          <button key={i} onClick={() => onPick(date)}
            className={`relative aspect-square flex items-center justify-center text-xs rounded-input transition-colors ${date === selected ? "bg-[#34D399] text-[#07070F] font-semibold" : date === today ? "border border-[#34D399]/40 text-[#34D399]" : "text-text-secondary hover:bg-background-elevated"}`}>
            {Number(date.slice(-2))}
            {has.has(date) && date !== selected && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#34D399]" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// Lazy-loads a segment's audio blob from IndexedDB on first play.
function AudioChip({ seg }: { seg: LogSegment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const toggle = useCallback(async () => {
    if (audioRef.current && url) {
      if (playing) { audioRef.current.pause(); setPlaying(false); }
      else { void audioRef.current.play(); setPlaying(true); }
      return;
    }
    setLoading(true);
    const blob = await getAudio(seg.id);
    setLoading(false);
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    setTimeout(() => { audioRef.current?.play(); setPlaying(true); }, 0);
  }, [url, playing, seg.id]);

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-input border border-border-default text-xs text-text-secondary">
      <button onClick={toggle} className="text-[#34D399] hover:brightness-125">
        {loading ? <Loader2 size={12} className="animate-spin" /> : playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      {fmtTime(seg.startTs)}
      {url && <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />}
    </span>
  );
}
