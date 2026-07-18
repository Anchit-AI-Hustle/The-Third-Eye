import type { NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { scrapeChatForUser } from "@/lib/ingest";
import { cronAuthorized, connectedGoogleUsers } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron: poll each connected user's Google Chat spaces for new messages
// since a per-space high-water mark, extract tasks, and dedup/merge. Opt-in —
// only runs for users who granted the Chat scopes via /api/connect/google.
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const sb = getAdminSupabase();
  if (!sb) return Response.json({ error: "Supabase not configured" }, { status: 501 });

  const users = await connectedGoogleUsers(sb);
  const summary: Record<string, unknown> = {};
  for (const email of users) {
    try {
      summary[email] = await scrapeChatForUser(sb, email);
    } catch (e) {
      summary[email] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json({ users: users.length, summary });
}
