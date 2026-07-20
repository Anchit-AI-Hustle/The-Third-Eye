import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

// Account deletion (right to erasure). Removes every row this user owns across
// all tables, then the client clears on-device data (localStorage, IndexedDB,
// device vault) and signs out. Auth is via the NextAuth session — a user can
// only ever delete their own data (all rows are keyed by user_id = email).
//
// If Supabase isn't configured, there's no server-side data to remove — the
// client still wipes local data and signs out, so the account is gone locally.

// Every user-owned table. We attempt user_id first, then email, so tables that
// key by either column are covered; missing tables/columns are ignored.
const TABLES = [
  "tasks", "team_members", "notes", "goals", "knowledge_docs", "expenses", "music_tracks",
  "lifelog_days",
  "job_agent_profiles", "career_preferences", "candidate_documents", "candidate_facts",
  "saved_jobs", "job_matches", "resume_documents", "cover_letters", "answer_library",
  "applications", "application_answers", "application_events", "agent_runs",
  "job_agent_settings", "job_agent_audit",
  "cortex_memories", "cortex_doc_chunks", "reminders", "push_subscriptions",
  "notification_log", "processed_messages", "chat_watermarks", "activity_log",
  "profiles", "google_tokens",
];

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const sb = getAdminSupabase();
  if (!sb) {
    // Nothing stored server-side — the client will still wipe local + sign out.
    return Response.json({ ok: true, remote: false, deleted: [] });
  }

  const deleted: string[] = [];
  const failed: string[] = [];
  for (const table of TABLES) {
    let ok = false;
    for (const col of ["user_id", "email"]) {
      const { error } = await sb.from(table).delete().eq(col, email);
      if (!error) { ok = true; break; }
      // Column-missing / relation-missing → try the other column / skip table.
    }
    (ok ? deleted : failed).push(table);
  }

  return Response.json({ ok: true, remote: true, deleted, failed });
}
