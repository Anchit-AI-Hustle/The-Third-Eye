import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { scrapeGmailForUser } from "@/lib/ingest";
import { cronAuthorized, connectedGoogleUsers } from "@/lib/cron";
import { dispatchDaily } from "@/lib/music/daily";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron: scan each connected user's recent unread Gmail, extract tasks,
// and dual-write via the dedup/merge path. Opt-in — only runs for users who
// granted gmail.readonly through /api/connect/google.
//
// Also the daily drop's second sweep, 45 minutes after the first: anyone whose
// chain hand-off failed still has no track for today and is dispatched again.
// (Hobby plans get two daily crons; this is the other one.)
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const sb = getDb();
  if (!sb) return Response.json({ error: "Database not configured" }, { status: 501 });

  const music = await dispatchDaily(sb);
  const users = await connectedGoogleUsers(sb);
  const summary: Record<string, unknown> = {};
  for (const email of users) {
    try {
      summary[email] = await scrapeGmailForUser(sb, email);
    } catch (e) {
      summary[email] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json({ users: users.length, summary, music });
}
