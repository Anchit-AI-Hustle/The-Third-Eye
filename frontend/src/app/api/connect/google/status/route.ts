import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { googleCapabilities } from "@/lib/googleToken";

export const runtime = "nodejs";

// Reports whether the signed-in user has connected Google (via the connect
// flow) and which scopes were granted — powers the Connections UI in Settings.
//
// WHAT "CONNECTED" MEANS HERE
//   It used to mean `!!row`: a row exists in google_tokens. That was true of
//   every signed-in user, because sign-in itself wrote one. Since sign-in asks
//   for identity only, Settings told everybody "Connected" under a list of zero
//   permissions, while Gmail and Calendar were not connected at all. The badge
//   was answering a question nobody asks — "do we hold a token for you" —
//   instead of the one the card exists to answer: can the features work.
//
//   It now means the stored grant carries at least one feature scope. lib/auth.ts
//   no longer writes identity-only rows, so new data cannot produce this state,
//   but rows written before that fix are still in the table and this endpoint is
//   what a user sees. Reading the scopes rather than trusting the row's presence
//   is also the check that survives a scope being revoked at Google's end.
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ connected: false }, { status: 200 });

  const sb = getDb();
  if (!sb) return Response.json({ connected: false, configured: false });

  const { data } = await sb
    .from("google_tokens")
    .select("scope, updated_at")
    .eq("user_id", email)
    .maybeSingle();

  const row = data as { scope?: string; updated_at?: string } | null;
  const scopes = row?.scope ? row.scope.split(/\s+/).filter(Boolean) : [];
  // Which features the grant actually permits, so the card can stop inferring
  // capability from a single boolean. Derived from capabilities rather than the
  // current scope list so a grant of the pre-narrowing calendar.readonly still counts.
  const capabilities = googleCapabilities(row?.scope);
  return Response.json(
    {
      connected: Object.values(capabilities).some(Boolean),
      scopes,
      capabilities,
      updatedAt: row?.updated_at ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
