import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";

export const runtime = "nodejs";
export const maxDuration = 30;

const TYPES = ["meeting", "brainstorm", "work", "personal", "learning", "other"] as const;

// Live-capture understanding: take a chunk of transcribed speech and pull out
// what's actionable — tasks, reminders, ideas — plus a one-line summary and a
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

  try {
    const out = await llmCascade({
      jsonMode: true,
      system:
        "You process a live transcript of speech (meetings, calls, self-talk, brainstorms). " +
        "Extract only what is genuinely present — never invent. Return ONLY JSON:\n" +
        '{ "type": one of ' + JSON.stringify(TYPES) + ',\n' +
        '  "summary": "one sentence on what this was about",\n' +
        '  "tasks": [{"title": "...", "priority": "low|medium|high|urgent", "due_date": "YYYY-MM-DD or empty"}],\n' +
        '  "reminders": [{"text": "...", "when": "natural-language time or empty"}],\n' +
        '  "ideas": ["..."] }\n' +
        "Tasks = concrete action items someone should do. Reminders = time-anchored nudges. " +
        "Ideas = notable thoughts/insights worth keeping. Empty arrays are fine.",
      messages: [{ role: "user", content: transcript }],
    });
    const p = JSON.parse(out.text);
    const type = (TYPES as readonly string[]).includes(p.type) ? p.type : "other";
    const arr = (x: unknown) => (Array.isArray(x) ? x : []);
    return Response.json({
      type,
      summary: String(p.summary ?? "").slice(0, 300),
      tasks: arr(p.tasks).slice(0, 20),
      reminders: arr(p.reminders).slice(0, 20),
      ideas: arr(p.ideas).slice(0, 20).map((s: unknown) => String(s).slice(0, 300)),
    });
  } catch (e) {
    console.error("capture extract error:", e);
    return Response.json({ error: "Extraction failed" }, { status: 500 });
  }
}
