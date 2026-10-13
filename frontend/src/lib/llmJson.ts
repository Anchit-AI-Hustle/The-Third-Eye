import type { ZodType } from "zod";

// Models in JSON mode still wrap output in prose or fences, leave trailing
// commas, and get cut off at max_tokens mid-array. Read what is there instead
// of losing the whole answer.

const CLOSE: Record<string, string> = { "{": "}", "[": "]" };
const dropTrailingCommas = (s: string) => s.replace(/,(\s*[}\]])/g, "$1").replace(/,\s*$/, "");

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function parseLlmJson(text: string): { value: Record<string, unknown>; repaired: boolean } {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i)?.[1] ?? text;
  const start = body.indexOf("{");
  if (start < 0) throw new Error("no JSON object in model output");
  const src = body.slice(start);

  // Walk once: find where the top-level object closes, and remember every
  // point where the text so far holds only complete values (before a comma,
  // just after an opening bracket) with the brackets still open there. Cuts
  // inside a nested object are skipped so a half-written item is dropped
  // whole rather than kept with fields missing.
  const stack: string[] = [];
  const cuts: { at: number; open: string[] }[] = [];
  const cut = (at: number) => { if (stack.length === 1 || stack.at(-1) === "[") cuts.push({ at, open: [...stack] }); };
  let inStr = false;
  let end = -1;
  for (let i = 0; i < src.length && end < 0; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{" || c === "[") { stack.push(c); cut(i + 1); }
    else if (c === "}" || c === "]") { stack.pop(); if (!stack.length) end = i + 1; }
    else if (c === ",") cut(i);
  }

  if (end > 0) {
    const whole = src.slice(0, end);
    const clean = tryParse(whole);
    if (clean) return { value: clean, repaired: false };
    const fixed = tryParse(dropTrailingCommas(whole));
    if (fixed) return { value: fixed, repaired: true };
  }
  for (let k = cuts.length - 1; k >= 0; k--) {
    const { at, open } = cuts[k];
    const v = tryParse(dropTrailingCommas(src.slice(0, at)) + open.reverse().map((b) => CLOSE[b]).join(""));
    if (v) return { value: v, repaired: true };
  }
  throw new Error("model output is not valid JSON");
}

export function validItems<T>(raw: unknown, schema: ZodType<T>): { items: T[]; dropped: number } {
  if (!Array.isArray(raw)) return { items: [], dropped: 0 };
  const items: T[] = [];
  for (const r of raw) {
    const p = schema.safeParse(r);
    if (p.success) items.push(p.data);
  }
  return { items, dropped: raw.length - items.length };
}
