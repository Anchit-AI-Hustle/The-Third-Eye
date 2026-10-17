import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { parseLlmJson } from "@/lib/llmJson";

export const runtime = "nodejs";
export const maxDuration = 60;

// Life Log event extraction: turn a day's rolling transcript into a timeline of
// discrete events + a short day summary. Cascaded (multi-provider) so it keeps
// working on free keys. Deterministic-ish (low temperature) and JSON-only.

interface Body { transcript?: string; date?: string; existing?: { title: string }[] }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const transcript = (body.transcript ?? "").trim();
  if (transcript.length < 20) return Response.json({ events: [], summary: "" });

  const system = [
    "You are a life-logging assistant. You are given part of a rough, possibly noisy speech-to-text transcript of someone's day (meetings, conversations, thoughts said aloud).",
    "Each transcript line starts with the local time it was recorded, like [14:05].",
    "Extract a concise timeline of the DISTINCT things that happened or were discussed, and a short reflective summary of this part of the day.",
    "Rules:",
    "• Each event: a short title (≤ 8 words), a kind from [meeting, conversation, task, idea, decision, note, other], the HH:MM time of the line it comes from, and an optional one-line detail.",
    "• Merge duplicates; ignore filler and transcription noise; do not invent specifics that aren't supported by the text.",
    "• Order events as they appear in the transcript.",
    "• Output ONLY JSON: { \"events\": [{\"title\": string, \"kind\": string, \"time\": string, \"detail\": string}], \"summary\": string }.",
  ].join("\n");

  const parts = chunk(transcript);
  const events: { title: string; kind: string; time?: string; detail?: string }[] = [];
  const summaries: string[] = [];
  try {
    for (const part of parts) {
      const user = [
        body.date ? `Date: ${body.date}` : "",
        body.existing?.length ? `Already-logged event titles (don't repeat): ${body.existing.map((e) => e.title).join("; ")}` : "",
        "Transcript:",
        part,
      ].filter(Boolean).join("\n");
      const out = await llmCascade({ system, messages: [{ role: "user", content: user }], jsonMode: true, maxTokens: 1200, temperature: 0.3, stage: "lifelog:extract" });
      const parsed = parseLlmJson(out.text).value as { events?: any[]; summary?: string };
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
  } catch (e) {
    // An error status, so the client keeps the timeline it already has.
    return Response.json({ error: "Couldn't build the timeline right now. Your recordings are safe; try again shortly.", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
  return Response.json({ events: events.slice(0, 80), summary: summaries.join(" ").slice(0, 1500) });
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
