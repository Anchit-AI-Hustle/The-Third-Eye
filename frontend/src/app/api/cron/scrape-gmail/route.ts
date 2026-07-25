import type { NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { scrapeGmailForUser } from "@/lib/ingest";
import { cronAuthorized, connectedGoogleUsers } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron: scan each connected user's recent unread Gmail, extract tasks,
// and dual-write via the dedup/merge path. Opt-in — only runs for users who
// granted gmail.readonly through /api/connect/google.
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const sb = getAdminSupabase();
  if (!sb) return Response.json({ error: "Supabase not configured" }, { status: 501 });

  const users = await connectedGoogleUsers(sb);
  const summary: Record<string, unknown> = {};
  for (const email of users) {
    try {
      summary[email] = await scrapeGmailForUser(sb, email);
    } catch (e) {
      summary[email] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json({ users: users.length, summary });
}
