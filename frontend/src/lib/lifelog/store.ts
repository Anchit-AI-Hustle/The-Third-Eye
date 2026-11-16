// Life Log metadata store — localStorage first (works offline / before any
// cloud table exists), cloud best-effort mirror via dataClient (same pattern as
// the music library). Audio blobs live in audioStore.ts (IndexedDB); this only
// holds transcript / events / diary / summary, which are small.

import { dataDelete, dataInsert, dataList } from "@/lib/dataClient";
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
  try { localStorage.setItem(KEY(day.date), JSON.stringify(day)); } catch { /* quota - noop */ }
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

/** Merge cloud-stored days into this device (best-effort): days recorded on
 * another device, or by the Android app's background recorder, show up here. */
export async function syncFromCloud(): Promise<string[]> {
  const changed: string[] = [];
  try {
    const r = await dataList<any>(ENTITY).catch(() => ({ rows: [] as any[] }));
    for (const row of r.rows ?? []) {
      if (!row?.date) continue;
      const cloud: DayLog = {
        date: row.date, segments: row.segments ?? [], events: row.events ?? [],
        diary: row.diary ?? [], summary: row.summary ?? "", updatedAt: Date.parse(row.updated_at) || Date.now(),
      };
      const raw = localStorage.getItem(KEY(row.date));
      if (!raw) { localStorage.setItem(KEY(row.date), JSON.stringify(cloud)); changed.push(row.date); continue; }
      const mine: DayLog = { ...emptyDay(row.date), ...JSON.parse(raw) };
      if (cloud.updatedAt <= mine.updatedAt) continue;
      localStorage.setItem(KEY(row.date), JSON.stringify(mergeDays(mine, cloud)));
      changed.push(row.date);
    }
    const cloudDates = (r.rows ?? []).map((x: any) => x.date).filter(Boolean);
    if (cloudDates.length) writeIndex([...readIndex(), ...cloudDates]);
  } catch { /* noop */ }
  return changed;
}

// The newer cloud copy wins for the timeline and summary; recordings and diary
// entries from both are kept, and this device keeps its own audio.
export function mergeDays(mine: DayLog, cloud: DayLog): DayLog {
  const byId = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...b, ...a].map((x) => [x.id, x])).values()];
  return {
    ...mine,
    segments: byId(mine.segments, cloud.segments).sort((a, b) => a.startTs - b.startTs),
    diary: byId(mine.diary, cloud.diary).sort((a, b) => a.ts - b.ts),
    events: cloud.events.length ? cloud.events : mine.events,
    summary: cloud.summary || mine.summary,
    updatedAt: cloud.updatedAt,
  };
}

export async function deleteDay(date: string): Promise<void> {
  const day = loadDay(date);
  await deleteAudio(day.segments.map((s) => s.id));
  try { localStorage.removeItem(KEY(date)); } catch { /* noop */ }
  writeIndex(readIndex().filter((d) => d !== date));
  // Or syncFromCloud brings it straight back on the next mount.
  await dataDelete(ENTITY, date).catch(() => {});
}
