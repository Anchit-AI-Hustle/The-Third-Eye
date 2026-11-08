import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveLifeActions } from "@/lib/lifelog/actions";
import { extractDay } from "@/lib/lifelog/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

// Life Log extraction for a client that holds the day (web, native apps):
// timeline + summary back, follow-ups saved as tasks and reminders.

interface Body { transcript?: string; date?: string; tzOffset?: number }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const transcript = (body.transcript ?? "").trim();
  if (transcript.length < 20) return Response.json({ events: [], summary: "", actions: [] });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") ? body.date! : new Date().toISOString().slice(0, 10);

  const out = await extractDay(transcript, date);
  // An error status, so the client keeps the timeline it already has.
  if (!out) return Response.json({ error: "Couldn't build the timeline right now. Your recordings are safe; try again shortly." }, { status: 502 });
  const saved = await saveLifeActions(session.user.email, date, out.actions, Number(body.tzOffset) || 0).catch(() => out.actions.map((a) => ({ ...a, saved: false, note: "Couldn't save right now." })));
  return Response.json({ events: out.events, summary: out.summary, actions: saved });
}
