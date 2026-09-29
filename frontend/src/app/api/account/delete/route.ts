import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { revokeGoogleAccess } from "@/lib/googleToken";

export const runtime = "nodejs";

// Account deletion (right to erasure). Removes every row this user owns across
// all tables, then the client clears on-device data (localStorage, IndexedDB,
// device vault) and signs out. Auth is via the NextAuth session — a user can
// only ever delete their own data (all rows are keyed by user_id = email).
//
// If the database isn't configured, there's no server-side data to remove — the
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
  // jarvis_memory is the assistant's persistent memory (lib/memoryStore.ts),
  // usage_counters its metering history. Both were missing while Settings promised
  // to delete "memory and all cloud data".
  "jarvis_memory", "usage_counters",
  "cortex_memories", "cortex_doc_chunks", "reminders", "push_subscriptions",
  "notification_log", "processed_messages", "chat_watermarks", "activity_log", "device_logs",
  "profiles", "google_tokens",
  // GATEWAY CREDENTIALS, AND THEY MATTER MORE THAN THE REST OF THIS LIST.
  // gateway_tokens holds long-lived bearer tokens, and emailForToken()
  // authenticates from that row alone — /api/chat never re-checks phone_users. So
  // a surviving token went on acting as the deleted account, with a session the
  // person could not see or revoke because their account was gone.
  "gateway_tokens", "agent_control", "conversation_sources",
  // agent_audit is documented append-only, and the app never deletes from it. This
  // is the one exception, stated so it does not read as a mistake: erasure on
  // request outranks keeping a record of what the agent did for an account that no
  // longer exists.
  "agent_audit",
];

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const sb = getDb();
  if (!sb) {
    // Nothing stored server-side — the client will still wipe local + sign out.
    return Response.json({ ok: true, remote: false, deleted: [] });
  }

  // Before the row is deleted, tell Google to drop the grant. Order matters:
  // once google_tokens is cleared we no longer hold the refresh token, and the
  // user would be left with a live "Third-party access" entry for an account
  // that no longer exists.
  const google = await revokeGoogleAccess(email);

  const deleted: string[] = [];
  const failed: string[] = [];

  // A table or column this schema does not have is not a failed deletion —
  // there was nothing there to delete. Only a real error counts, and only a real
  // error may stop the credential being removed below.
  const SCHEMA_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
  const realFailures: string[] = [];

  // THE FALLBACK USED TO HIDE REAL FAILURES, TWO WAYS.
  //
  // It tried `user_id` then `email` and kept only the LAST error, so a genuine
  // failure on `user_id` was masked by a schema error on `email`, and the route
  // went on to delete the credential while the rows were still there.
  //
  // Worse since this PR added `google_tokens.email` for the connected mailbox: on
  // that table the fallback now SUCCEEDS, deleting nothing (the column holds a
  // Google address, not the identity), and reported the table as cleared whatever
  // the first attempt did.
  //
  // So `email` is tried only when `user_id` does not exist on the table, and the
  // error that decides the outcome is the FIRST one, never the fallback's.
  const UNDEFINED_COLUMN = "42703";
  for (const table of TABLES) {
    const first = await sb.from(table).delete().eq("user_id", email);
    if (!first.error) {
      deleted.push(table);
      continue;
    }
    const firstCode = (first.error as { code?: string }).code ?? "";

    if (firstCode === UNDEFINED_COLUMN) {
      const byEmail = await sb.from(table).delete().eq("email", email);
      if (!byEmail.error) {
        deleted.push(table);
        continue;
      }
      failed.push(table);
      if (!SCHEMA_CODES.has((byEmail.error as { code?: string }).code ?? "")) realFailures.push(table);
      continue;
    }

    failed.push(table);
    if (!SCHEMA_CODES.has(firstCode)) realFailures.push(table);
  }

  // THE SIGN-IN CREDENTIAL GOES LAST, AND ONLY IF EVERYTHING ELSE WENT.
  //
  // It was first, so that it would be visible rather than buried in the loop.
  // That was the wrong order. If a later delete failed, the credential was
  // already gone, this route still answered 200, the client wiped local storage
  // and signed the user out — and they could no longer authenticate to try
  // again, while the rows named in `failed` stayed in the database for good.
  // Erasure that removes the only way to ask again is worse than erasure that
  // has to be repeated.
  //
  // `email` IS the E.164 number under phone sign-in (see lib/auth.ts), which is
  // what makes this match; the loop above cannot do it, because it keys on
  // `user_id`/`email` and this is the one table keyed on `phone`.
  if (realFailures.length) {
    return Response.json(
      {
        error:
          "Some of your data could not be deleted, so your sign-in has been left intact — " +
          "you are still signed in and can try again.",
        remote: true,
        deleted,
        failed: realFailures,
        google,
      },
      { status: 500 },
    );
  }

  // THE NUMBER HELD BY THE RATE LIMITER, still before the credential.
  //
  // auth_rate_limit keys its per-number bucket on the E.164 number itself, and the
  // limiter only ever resets counters — it never deletes rows. So the number
  // outlived the account it belonged to, against a route and a privacy policy that
  // both promise removal. (The sampled prune in auth_rate_limit_hit would reach it
  // within a day, but "eventually" is not what erasure on request means.)
  //
  // It is here rather than after the credential because I put it after on the
  // first attempt and walked straight back into the hazard the ordering above
  // exists to avoid: the credential gone, this row left, a 500 asking the person
  // to retry, and no way to authenticate for that retry once the JWT expired.
  // Anything that needs the identity to find its rows has to run BEFORE the thing
  // that proves the identity.
  //
  // The per-caller bucket is keyed on an address, not on this person, and there is
  // no mapping from one to the other — so there is nothing here to match it by,
  // and that row expires on its own.
  const { error: rlError } = await sb.from("auth_rate_limit").delete().eq("k", email);
  if (rlError && !SCHEMA_CODES.has((rlError as { code?: string }).code ?? "")) {
    return Response.json(
      {
        error:
          "Some of your data could not be deleted, so your sign-in has been left intact — " +
          "you are still signed in and can try again.",
        remote: true,
        deleted,
        failed: [...realFailures, "auth_rate_limit"],
        google,
      },
      { status: 500 },
    );
  }
  deleted.push("auth_rate_limit");

  const { error: credError } = await sb.from("phone_users").delete().eq("phone", email);
  if (credError) {
    return Response.json(
      {
        error: "Your data was deleted, but your sign-in could not be removed. Please try again.",
        remote: true,
        deleted,
        failed,
        google,
      },
      { status: 500 },
    );
  }
  deleted.push("phone_users");

  return Response.json({ ok: true, remote: true, deleted, failed, google });
}
