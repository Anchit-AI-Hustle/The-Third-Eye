import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";

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
    "You are a life-logging assistant. You are given a rough, possibly noisy speech-to-text transcript of someone's day (meetings, conversations, thoughts said aloud).",
    "Extract a concise timeline of the DISTINCT things that happened or were discussed, and a short reflective day summary.",
    "Rules:",
    "• Each event: a short title (≤ 8 words), a kind from [meeting, conversation, task, idea, decision, note, other], and an optional one-line detail.",
    "• Merge duplicates; ignore filler and transcription noise; do not invent specifics that aren't supported by the text.",
    "• Order events as they appear in the transcript.",
    "• Output ONLY JSON: { \"events\": [{\"title\": string, \"kind\": string, \"detail\": string}], \"summary\": string }.",
  ].join("\n");
  const user = [
    body.date ? `Date: ${body.date}` : "",
    body.existing?.length ? `Already-logged event titles (don't repeat): ${body.existing.map((e) => e.title).join("; ")}` : "",
    "Transcript:",
    transcript.slice(0, 12000),
  ].filter(Boolean).join("\n");

  try {
    const out = await llmCascade({ system, messages: [{ role: "user", content: user }], jsonMode: true, maxTokens: 1200, temperature: 0.3, stage: "lifelog:extract" });
    let parsed: { events?: any[]; summary?: string } = {};
    try { parsed = JSON.parse(out.text); }
    catch { const s = out.text.indexOf("{"), e = out.text.lastIndexOf("}"); if (s >= 0 && e > s) { try { parsed = JSON.parse(out.text.slice(s, e + 1)); } catch { /* noop */ } } }
    const events = Array.isArray(parsed.events) ? parsed.events.slice(0, 40).map((e: any) => ({
      title: String(e.title ?? "").slice(0, 120),
      kind: ["meeting", "conversation", "task", "idea", "decision", "note", "other"].includes(e.kind) ? e.kind : "other",
      detail: e.detail ? String(e.detail).slice(0, 300) : undefined,
    })).filter((e: any) => e.title) : [];
    return Response.json({ events, summary: String(parsed.summary ?? "").slice(0, 1500), provider: out.provider });
  } catch (e) {
    return Response.json({ error: "extract_unavailable", detail: e instanceof Error ? e.message : "unknown", events: [], summary: "" }, { status: 200 });
  }
}
