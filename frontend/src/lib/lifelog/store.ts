// Life Log metadata store — localStorage first (works offline / before any
// cloud table exists), cloud best-effort mirror via dataClient (same pattern as
// the music library). Audio blobs live in audioStore.ts (IndexedDB); this only
// holds transcript / events / diary / summary, which are small.

import { dataInsert, dataList } from "@/lib/dataClient";
import { deleteAudio } from "./audioStore";
import { emptyDay, type DayLog } from "./types";

const KEY = (date: string) => `te_lifelog_v1_${date}`;
const INDEX = "te_lifelog_index_v1";
const ENTITY = "lifelog_days";

function readIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(INDEX) ?? "[]"); } catch { return []; }
}
function writeIndex(dates: string[]) {
  try { localStorage.setItem(INDEX, JSON.stringify([...new Set(dates)].sort().reverse())); } catch { /* noop */ }
}

export function loadDay(date: string): DayLog {
  try {
    const raw = localStorage.getItem(KEY(date));
    if (raw) return { ...emptyDay(date), ...JSON.parse(raw) };
  } catch { /* noop */ }
  return emptyDay(date);
}

export function saveDay(day: DayLog): void {
  day.updatedAt = Date.now();
  try { localStorage.setItem(KEY(day.date), JSON.stringify(day)); } catch { /* quota — noop */ }
  const idx = readIndex();
  if (!idx.includes(day.date)) writeIndex([day.date, ...idx]);
  // Cloud best-effort: one row per day (id = date). Transcript-only, small.
  dataInsert(ENTITY, {
    id: day.date, date: day.date,
    segments: day.segments.map((s) => ({ ...s, hasAudio: false })), // audio stays on-device
    events: day.events, diary: day.diary, summary: day.summary ?? "",
    updated_at: new Date(day.updatedAt).toISOString(),
  }).catch(() => {});
}

export function listDates(): string[] {
  return readIndex();
}

/** Merge any cloud-stored days into the local index (best-effort, on mount). */
export async function syncFromCloud(): Promise<void> {
  try {
    const r = await dataList<any>(ENTITY).catch(() => ({ rows: [] as any[] }));
    for (const row of r.rows ?? []) {
      if (!row?.date) continue;
      const local = localStorage.getItem(KEY(row.date));
      if (!local) {
        localStorage.setItem(KEY(row.date), JSON.stringify({
          date: row.date, segments: row.segments ?? [], events: row.events ?? [],
          diary: row.diary ?? [], summary: row.summary ?? "", updatedAt: Date.parse(row.updated_at) || Date.now(),
        }));
      }
    }
    const cloudDates = (r.rows ?? []).map((x: any) => x.date).filter(Boolean);
    if (cloudDates.length) writeIndex([...readIndex(), ...cloudDates]);
  } catch { /* noop */ }
}

export async function deleteDay(date: string): Promise<void> {
  const day = loadDay(date);
  await deleteAudio(day.segments.map((s) => s.id));
  try { localStorage.removeItem(KEY(date)); } catch { /* noop */ }
  writeIndex(readIndex().filter((d) => d !== date));
}
