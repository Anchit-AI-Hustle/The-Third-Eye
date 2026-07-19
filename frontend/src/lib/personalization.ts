"use client";

import { vaultGet, vaultSet } from "@/lib/deviceVault";

// On-device personalization layer. It records the user's own signals (what they
// pick, when, how often) and derives simple, transparent trends we use to
// pre-fill forms, rank suggestions, and give the AI real context. This is
// honest "learns from your history" personalization — NOT magic 100%-accurate
// prediction. Everything stays on the device (device vault).

export interface Signal {
  kind: string; // e.g. "health.goal", "event.subscribe", "workout.done"
  value: string;
  at: string; // ISO
  meta?: Record<string, unknown>;
}

const APP = "personalization";
const KEY = "signals";
const MAX = 500;

export function recordSignal(kind: string, value: string, meta?: Record<string, unknown>): void {
  const list = vaultGet<Signal[]>(APP, KEY, []);
  list.unshift({ kind, value, at: new Date().toISOString(), meta });
  vaultSet(APP, KEY, list.slice(0, MAX));
}

export function getSignals(kindPrefix?: string): Signal[] {
  const list = vaultGet<Signal[]>(APP, KEY, []);
  return kindPrefix ? list.filter((s) => s.kind.startsWith(kindPrefix)) : list;
}

/** Most frequent value for a signal kind (the learned preference). */
export function topValue(kind: string): string | undefined {
  const counts = new Map<string, number>();
  for (const s of getSignals(kind)) counts.set(s.value, (counts.get(s.value) ?? 0) + 1);
  let best: string | undefined; let n = 0;
  counts.forEach((c, v) => { if (c > n) { n = c; best = v; } });
  return best;
}

/** Learned day-of-week + hour tendencies for a signal kind (for scheduling). */
export function timePreference(kind: string): { topDays: number[]; topHours: number[] } {
  const days = new Array(7).fill(0);
  const hours = new Array(24).fill(0);
  for (const s of getSignals(kind)) {
    const d = new Date(s.at);
    if (!isNaN(d.getTime())) { days[d.getDay()]++; hours[d.getHours()]++; }
  }
  const rank = (arr: number[]) => arr.map((c, i) => [i, c] as [number, number]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => i);
  return { topDays: rank(days), topHours: rank(hours) };
}

/** A compact, human-readable summary of learned preferences to feed the AI. */
export function personalizationContext(): string {
  const sig = getSignals();
  if (!sig.length) return "";
  const kinds = Array.from(new Set(sig.map((s) => s.kind)));
  const lines = kinds.map((k) => {
    const top = topValue(k);
    return top ? `${k}: usually "${top}"` : null;
  }).filter(Boolean);
  return lines.length ? `Learned preferences (from this device's history):\n${lines.join("\n")}` : "";
}
