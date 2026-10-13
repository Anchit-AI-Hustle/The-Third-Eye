import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { llmCascade, userFacingLlmError } from "@/lib/llmCascade";
import { parseLlmJson, validItems } from "@/lib/llmJson";

export const runtime = "nodejs";
export const maxDuration = 30;

const TYPES = ["meeting", "brainstorm", "work", "personal", "learning", "other"] as const;
const text = z.string().trim().min(1).max(300);
const Task = z.object({
  title: text,
  priority: z.enum(["low", "medium", "high", "urgent"]).catch("medium"),
  due_date: z.string().catch("").default(""),
});
const Reminder = z.object({ text, when: z.string().catch("").default("") });

// Live-capture understanding: take a chunk of transcribed speech and pull out
// what's actionable (tasks, reminders, ideas) plus a one-line summary and a
// conversation type used to route the session into the right view. Auth-gated;
// runs through the quota-cascading client so a single provider 429 won't fail.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let transcript = "";
  try { transcript = String((await req.json())?.transcript ?? "").slice(0, 12000); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (transcript.trim().length < 8) {
    return Response.json({ type: "other", summary: "", tasks: [], reminders: [], ideas: [] });
  }

  let raw: string;
  try {
    const out = await llmCascade({
      jsonMode: true,
      system:
        "You process a live transcript of speech (meetings, calls, self-talk, brainstorms). " +
        "Extract only what is genuinely present, never invent. Return ONLY JSON:\n" +
        '{ "type": one of ' + JSON.stringify(TYPES) + ',\n' +
        '  "summary": "one sentence on what this was about",\n' +
        '  "tasks": [{"title": "...", "priority": "low|medium|high|urgent", "due_date": "YYYY-MM-DD or empty"}],\n' +
        '  "reminders": [{"text": "...", "when": "natural-language time or empty"}],\n' +
        '  "ideas": ["..."] }\n' +
        "Tasks = concrete action items someone should do. Reminders = time-anchored nudges. " +
        "Ideas = notable thoughts/insights worth keeping. Empty arrays are fine.",
      messages: [{ role: "user", content: transcript }],
    });
    raw = out.text;
  } catch (e) {
    console.error("capture extract error:", e instanceof Error ? e.message : e);
    return Response.json({ error: userFacingLlmError(e) }, { status: 503 });
  }

  // A malformed answer still yields whatever parts of it are valid; the
  // reason goes to the logs and back to the client as `partial`.
  const reasons: string[] = [];
  let p: Record<string, unknown> = {};
  try {
    const parsed = parseLlmJson(raw);
    p = parsed.value;
    if (parsed.repaired) reasons.push("output repaired");
  } catch (e) {
    reasons.push(e instanceof Error ? e.message : String(e));
  }
  const tasks = validItems(p.tasks, Task);
  const reminders = validItems(p.reminders, Reminder);
  const ideas = validItems(p.ideas, text);
  const dropped = tasks.dropped + reminders.dropped + ideas.dropped;
  if (dropped) reasons.push(`${dropped} invalid item(s) dropped`);
  const partial = reasons.join("; ") || undefined;
  if (partial) console.warn("capture extract partial:", partial);

  return Response.json({
    type: (TYPES as readonly string[]).includes(p.type as string) ? p.type : "other",
    summary: typeof p.summary === "string" ? p.summary.slice(0, 300) : "",
    tasks: tasks.items.slice(0, 20),
    reminders: reminders.items.slice(0, 20),
    ideas: ideas.items.slice(0, 20),
    partial,
  });
}
