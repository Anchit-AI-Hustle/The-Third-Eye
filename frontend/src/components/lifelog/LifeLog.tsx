"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Square, Loader2, ChevronLeft, ChevronRight, Play, Pause, Sparkles, BookHeart, Radio, Calendar as CalIcon, Clock, Trash2, RefreshCw, AlertTriangle, Bell, ListChecks } from "lucide-react";
import { loadDay, saveDay, listDates, syncFromCloud, deleteDay } from "@/lib/lifelog/store";
import { getAudio } from "@/lib/lifelog/audioStore";
import { emptyDay, localDateKey, type DayLog, type LogSegment, type LogEvent, type DiaryEntry, type SavedAction } from "@/lib/lifelog/types";
import { LIFELOG_UPDATED, useLifeLog } from "./LifeLogRecorder";
import { CaptureNote } from "@/components/privacy/CaptureNote";

const KIND_COLORS: Record<string, string> = {
  meeting: "#4FC3F7", conversation: "#34D399", task: "#F0C94E",
  idea: "#A78BFA", decision: "#F472B6", note: "#94A3B8", other: "#64748B",
};
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDayTitle = (date: string) => new Date(date + "T00:00:00").toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export function LifeLog() {
  const today = useMemo(() => localDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [day, setDay] = useState<DayLog>(() => emptyDay(today));
  const [dates, setDates] = useState<string[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [diaryText, setDiaryText] = useState("");
  const { rec, listen, stopListening, extracting, extractError, extract } = useLifeLog();

  const selectedRef = useRef(selectedDate);
  selectedRef.current = selectedDate;
  // The day on screen was read before this first sync; read it again after.
  useEffect(() => { syncFromCloud().finally(() => { setDates(listDates()); setDay(loadDay(selectedRef.current)); }); }, []);
  useEffect(() => { setDay(loadDay(selectedDate)); }, [selectedDate]);
  useEffect(() => {
    const onUpdate = (e: Event) => {
      setDates(listDates());
      if ((e as CustomEvent<string>).detail === selectedDate) setDay(loadDay(selectedDate));
    };
    window.addEventListener(LIFELOG_UPDATED, onUpdate);
    return () => window.removeEventListener(LIFELOG_UPDATED, onUpdate);
  }, [selectedDate]);

  const toggleRecord = useCallback(() => {
    if (rec.recording) stopListening();
    else { setSelectedDate(localDateKey(new Date())); listen(); }
  }, [rec.recording, stopListening, listen]);

  const addDiary = useCallback(() => {
    const text = diaryText.trim();
    if (!text) return;
    const d = loadDay(selectedDate);
    d.diary = [...d.diary, { id: crypto.randomUUID(), ts: Date.now(), text }];
    saveDay(d); setDay(d); setDiaryText(""); setDates(listDates());
  }, [diaryText, selectedDate]);

  const removeDay = useCallback(async () => {
    if (!confirm(`Delete the entire log for ${selectedDate}? This removes its audio, transcript, timeline and diary.`)) return;
    await deleteDay(selectedDate);
    setDates(listDates());
    setDay(loadDay(selectedDate));
  }, [selectedDate]);

  const hours = useMemo(() => byHour(day), [day]);
  const actions = day.actions ?? [];
  const needsYou = actions.filter((a) => a.needsYou);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
      {/* Left: recorder + calendar */}
      <div className="space-y-4">
        <div className="rounded-card border border-border-default bg-background-surface/40 p-4 space-y-3">
          <div className="flex items-center gap-2"><Radio size={15} className={rec.recording ? "text-accent-red animate-pulse" : "text-[#34D399]"} /><span className="hud-label text-[#34D399]">Recorder</span></div>
          <button onClick={toggleRecord}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold transition-all ${rec.recording ? "bg-accent-red/15 text-accent-red border border-accent-red/30 hover:bg-accent-red/25" : "text-[#07070F] bg-[#34D399] hover:brightness-110"}`}>
            {rec.recording ? <><Square size={14} /> Stop listening</> : <><Mic size={15} /> Always listen</>}
          </button>
          {rec.recording && <p className="text-[11px] font-mono text-text-muted flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" /> Listening · {day.segments.length} segment{day.segments.length === 1 ? "" : "s"}{rec.lastAt ? ` · last ${fmtTime(rec.lastAt)}` : ""}</p>}
          {rec.error && <p className="text-[11px] text-accent-red flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-none" />{rec.error}</p>}
          {extractError && <p className="text-[11px] text-accent-red flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-none" />{extractError}</p>}
          <p className="text-[10px] text-text-muted leading-relaxed">Keeps listening on every page until you stop it, and picks itself back up if the mic drops or you come back to the app. Every 30 minutes a notification reminds you it is on; tap it to turn listening off. Follow-ups it hears become tasks and reminders, and the assistant works on them. In the Android app it keeps listening with the screen off; in a browser the screen is kept awake while listening, since a locked phone stops the mic.</p>
          <CaptureNote id="life-log" className="text-[10px]">Audio stays on this device. Speech is sent for transcription, and the text is saved to your account.</CaptureNote>
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
            <button onClick={() => void extract(selectedDate)} disabled={extracting || !day.segments.some((s) => s.transcript)} title="Re-summarise the day"
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

        {needsYou.length > 0 && (
          <div className="rounded-input border border-accent-red/30 bg-accent-red/[0.05] p-3">
            <div className="flex items-center gap-1.5 mb-1.5"><Bell size={12} className="text-accent-red" /><span className="hud-label text-accent-red">Needs you</span></div>
            <ul className="space-y-1">{needsYou.map((a) => <ActionRow key={`${a.type}${a.title}`} a={a} />)}</ul>
          </div>
        )}

        {actions.length > needsYou.length && (
          <div>
            <span className="hud-label text-text-muted flex items-center gap-1.5"><ListChecks size={12} /> The assistant is on these</span>
            <ul className="mt-2 space-y-1">{actions.filter((a) => !a.needsYou).map((a) => <ActionRow key={`${a.type}${a.title}`} a={a} />)}</ul>
            <Link href="/tasks" className="inline-block mt-1.5 text-[11px] text-[#34D399] hover:underline">Open Tasks</Link>
          </div>
        )}

        {/* Hour by hour */}
        <div>
          <span className="hud-label text-text-muted flex items-center gap-1.5"><Clock size={12} /> Hour by hour</span>
          {hours.length === 0 ? (
            <p className="text-sm text-text-muted mt-2">Nothing logged yet. Turn on listening, or add a diary note below.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {hours.map((h) => (
                <details key={h.hour} open={h.hour === hours[hours.length - 1].hour} className="rounded-input border border-border-default px-3 py-2">
                  <summary className="cursor-pointer select-none flex items-center gap-2 text-sm">
                    <span className="font-mono text-[#34D399]">{String(h.hour).padStart(2, "0")}:00</span>
                    <span className="text-text-muted text-xs">{[h.events.length && `${h.events.length} event${h.events.length === 1 ? "" : "s"}`, h.audio.length && `${h.audio.length} recording${h.audio.length === 1 ? "" : "s"}`, h.actions.length && `${h.actions.length} follow-up${h.actions.length === 1 ? "" : "s"}`, h.diary.length && "diary"].filter(Boolean).join(" · ")}</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    {h.events.map((ev) => (
                      <div key={ev.id} className="flex items-start gap-2.5">
                        <span className="text-[10px] font-mono text-text-muted w-11 flex-none pt-0.5">{fmtTime(ev.ts)}</span>
                        <span className="w-2 h-2 rounded-full flex-none mt-1.5" style={{ background: KIND_COLORS[ev.kind] || KIND_COLORS.other }} />
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary">{ev.title} <span className="text-[10px] font-mono uppercase text-text-muted">· {ev.kind}</span></p>
                          {ev.detail && <p className="text-xs text-text-muted">{ev.detail}</p>}
                        </div>
                      </div>
                    ))}
                    {h.diary.map((di) => (
                      <div key={di.id} className="flex items-start gap-2.5">
                        <span className="text-[10px] font-mono text-text-muted w-11 flex-none pt-0.5">{fmtTime(di.ts)}</span>
                        <BookHeart size={13} className="text-[#F472B6] flex-none mt-1" />
                        <p className="text-sm text-text-secondary italic">{di.text}</p>
                      </div>
                    ))}
                    {h.actions.length > 0 && <ul className="space-y-1">{h.actions.map((a) => <ActionRow key={`${a.type}${a.title}`} a={a} />)}</ul>}
                    {h.audio.length > 0 && <div className="flex flex-wrap gap-2">{h.audio.map((s) => <AudioChip key={s.id} seg={s} />)}</div>}
                    {h.transcript && (
                      <details>
                        <summary className="text-[11px] text-text-muted cursor-pointer select-none">What was said</summary>
                        <pre className="mt-1 text-xs text-text-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">{h.transcript}</pre>
                      </details>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

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

interface Hour { hour: number; events: LogEvent[]; diary: DiaryEntry[]; audio: LogSegment[]; actions: SavedAction[]; transcript: string }

// Everything on the day, filed under the local hour it happened in.
export function byHour(day: DayLog): Hour[] {
  const map = new Map<number, Hour>();
  const at = (ts: number) => {
    const hour = new Date(ts).getHours();
    if (!map.has(hour)) map.set(hour, { hour, events: [], diary: [], audio: [], actions: [], transcript: "" });
    return map.get(hour)!;
  };
  for (const e of day.events) at(e.ts).events.push(e);
  for (const d of day.diary) at(d.ts).diary.push(d);
  for (const s of day.segments) {
    const h = at(s.startTs);
    if (s.hasAudio) h.audio.push(s);
    if (s.transcript) h.transcript += `${h.transcript ? "\n" : ""}[${fmtTime(s.startTs)}] ${s.transcript}`;
  }
  for (const a of day.actions ?? []) if (a.when?.startsWith(day.date)) at(new Date(a.when).getTime()).actions.push(a);
  for (const h of map.values()) { h.events.sort((a, b) => a.ts - b.ts); h.diary.sort((a, b) => a.ts - b.ts); }
  return [...map.values()].filter((h) => h.events.length || h.diary.length || h.audio.length || h.actions.length || h.transcript).sort((a, b) => a.hour - b.hour);
}

function ActionRow({ a }: { a: SavedAction }) {
  return (
    <li className="text-sm text-text-primary flex items-start gap-2">
      {a.type === "reminder" ? <Bell size={12} className="mt-1 flex-none text-[#F0C94E]" /> : <ListChecks size={12} className="mt-1 flex-none text-[#4FC3F7]" />}
      <div className="min-w-0">
        <p>{a.title}{a.when && <span className="text-[10px] font-mono text-text-muted"> · {a.when.replace("T", " ")}</span>}</p>
        {a.steps?.length ? <ul className="text-xs text-text-muted list-disc pl-4">{a.steps.map((s) => <li key={s}>{s}</li>)}</ul> : null}
        <p className={`text-[10px] ${a.saved ? "text-text-muted" : "text-accent-red"}`}>{a.saved ? (a.note ?? (a.type === "reminder" ? "Reminder set" : "Added to Tasks")) : (a.note ?? "Not saved")}</p>
      </div>
    </li>
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
