import { llmCascade } from "@/lib/llmCascade";
import { parseLlmJson } from "@/lib/llmJson";
import { cleanActions } from "./actions";
import type { LifeAction } from "./types";

export interface Extracted {
  events: { title: string; kind: string; time?: string; detail?: string }[];
  summary: string;
  actions: LifeAction[];
}

// A day's rolling transcript -> timeline, summary and the follow-ups said in
// it. Cascaded (multi-provider) so it keeps working on free keys. null when
// every provider failed, so callers keep the timeline they already have.
export async function extractDay(transcript: string, date: string): Promise<Extracted | null> {
  const system = [
    "You are a life-logging assistant. You are given part of a rough, possibly noisy speech-to-text transcript of someone's day (meetings, conversations, thoughts said aloud).",
    "Each transcript line starts with the local time it was recorded, like [14:05].",
    "Extract a concise timeline of the DISTINCT things that happened or were discussed, and a short reflective summary of this part of the day.",
    "Rules:",
    "• Each event: a short title (≤ 8 words), a kind from [meeting, conversation, task, idea, decision, note, other], the HH:MM time of the line it comes from, and an optional one-line detail.",
    "• Merge duplicates; ignore filler and transcription noise; do not invent specifics that aren't supported by the text.",
    "• Order events as they appear in the transcript.",
    "• Also list the follow-ups the person committed to or was asked to do (\"I'll send it tomorrow\", \"remind me to call mum at 6\", \"we need to book tickets\"). type \"reminder\" only when a time to be reminded is clear (when as HH:MM today or YYYY-MM-DDTHH:MM), otherwise \"task\" (when = deadline if one was said). steps = a short checklist when the follow-up has several parts. needsYou = true when only the person can do it (a call, a payment, a meeting, a decision, anything physical); false when an assistant could do it online (drafting, research, scheduling, looking things up).",
    "• Only follow-ups the person actually said or agreed to. Never invent one. None is a valid answer.",
    "• Output ONLY JSON: { \"events\": [{\"title\": string, \"kind\": string, \"time\": string, \"detail\": string}], \"summary\": string, \"actions\": [{\"type\": \"task\"|\"reminder\", \"title\": string, \"detail\": string, \"when\": string, \"steps\": string[], \"needsYou\": boolean}] }.",
  ].join("\n");

  const parts = chunk(transcript);
  const events: { title: string; kind: string; time?: string; detail?: string }[] = [];
  const summaries: string[] = [];
  const actions: LifeAction[] = [];
  try {
    for (const part of parts) {
      const user = [
        `Date: ${date}`,
        "Transcript:",
        part,
      ].filter(Boolean).join("\n");
      const out = await llmCascade({ system, messages: [{ role: "user", content: user }], jsonMode: true, maxTokens: 1800, temperature: 0.3, stage: "lifelog:extract" });
      const parsed = parseLlmJson(out.text).value as { events?: any[]; summary?: string; actions?: unknown };
      actions.push(...cleanActions(parsed.actions, date));
      for (const e of Array.isArray(parsed.events) ? parsed.events : []) {
        const title = String(e.title ?? "").slice(0, 120);
        if (!title) continue;
        events.push({
          title,
          kind: KINDS.includes(e.kind) ? e.kind : "other",
          time: /^\d{1,2}:\d{2}$/.test(String(e.time ?? "")) ? String(e.time) : undefined,
          detail: e.detail ? String(e.detail).slice(0, 300) : undefined,
        });
      }
      if (parsed.summary) summaries.push(String(parsed.summary));
    }
  } catch {
    return null;
  }
  return { events: events.slice(0, 80), summary: summaries.join(" ").slice(0, 1500), actions };
}

const KINDS = ["meeting", "conversation", "task", "idea", "decision", "note", "other"];
const CHUNK_CHARS = 12000;
const MAX_CHUNKS = 4;

// Whole lines in pieces small enough for a free-tier request. A very long day
// keeps evenly spaced pieces rather than only its first hours.
function chunk(transcript: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of transcript.split("\n")) {
    const l = line.slice(0, CHUNK_CHARS);
    if (cur && cur.length + l.length + 1 > CHUNK_CHARS) { out.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + l;
  }
  if (cur) out.push(cur);
  if (out.length <= MAX_CHUNKS) return out;
  return Array.from({ length: MAX_CHUNKS }, (_, i) => out[Math.round((i * (out.length - 1)) / (MAX_CHUNKS - 1))]);
}
