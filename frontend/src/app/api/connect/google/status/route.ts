import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

// Reports whether the signed-in user has connected Google (via the connect
// flow) and which scopes were granted — powers the Connections UI in Settings.
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ connected: false }, { status: 200 });

  const sb = getAdminSupabase();
  if (!sb) return Response.json({ connected: false, configured: false });

  const { data } = await sb
    .from("google_tokens")
    .select("scope, updated_at")
    .eq("user_id", email)
    .maybeSingle();

  const row = data as { scope?: string; updated_at?: string } | null;
  const scopes = row?.scope ? row.scope.split(/\s+/).filter(Boolean) : [];
  return Response.json(
    { connected: !!row, scopes, updatedAt: row?.updated_at ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
