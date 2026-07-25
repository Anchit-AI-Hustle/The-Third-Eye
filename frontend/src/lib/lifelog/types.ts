// Life Log — a per-day record of what happened: audio segments, their
// transcript, an extracted event timeline, free-form diary entries, and an AI
// day summary. Everything is keyed by local date (YYYY-MM-DD).
//
// Platform note: browsers pause microphone capture when the tab is backgrounded
// or the screen locks (iOS Safari especially), so recording runs while the app
// is open/foreground. True 24/7 background capture needs the native app.

export interface LogSegment {
  id: string;
  startTs: number;      // epoch ms
  endTs: number;
  transcript: string;
  hasAudio: boolean;    // whether an audio blob is stored in IndexedDB for this id
  provider?: string;    // transcription provider used
  silent?: boolean;     // chunk was (near-)silent — kept for the timeline, no transcript
}

export interface LogEvent {
  id: string;
  ts: number;           // epoch ms (approx time the event happened)
  title: string;
  kind: string;         // meeting | task | idea | conversation | decision | note | other
  detail?: string;
}

export interface DiaryEntry {
  id: string;
  ts: number;
  text: string;
  mood?: string;
}

export interface DayLog {
  date: string;         // YYYY-MM-DD (local)
  segments: LogSegment[];
  events: LogEvent[];
  diary: DiaryEntry[];
  summary?: string;
  updatedAt: number;
}

export function emptyDay(date: string): DayLog {
  return { date, segments: [], events: [], diary: [], updatedAt: Date.now() };
}

/** Local YYYY-MM-DD for a Date (not UTC — a day is the user's local day). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
