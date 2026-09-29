// Cleanup for values the AI fills into the Music Studio form. Models hand back
// "Goa Trance," with a trailing comma, lists as arrays or as one string, and
// sometimes filler ("N/A", "999999999"); each field gets exactly what it can use.

import { BPM_MAX, BPM_MIN } from "./types";

/** One clean value: no wrapping quotes, stray punctuation or doubled spaces. */
export function cleanValue(v: unknown): string {
  const s = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`*•\-–,;:.]+|[\s"'`*,;:]+$/g, "")
    .trim();
}

const JUNK = /^(n\/?a|none|null|undefined|unknown|tbd|-+)$/i;

/** A comma list: cleaned, de-duplicated (case-insensitive), junk and bare numbers dropped. */
export function cleanList(v: unknown, max: number): string[] {
  const parts = (Array.isArray(v) ? v.map(String) : cleanValue(v).split(/[,;\n]/)).map(cleanValue);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!p || JUNK.test(p) || /^[\d\W_]+$/.test(p) || seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** A whole number within range, or null when the value isn't one. */
export function cleanNumber(v: unknown, lo: number, hi: number): number | null {
  const m = String(v ?? "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Math.round(Number(m[0]));
  return n >= lo && n <= hi ? n : null;
}

export const cleanTempo = (v: unknown) => cleanNumber(v, BPM_MIN, BPM_MAX);
