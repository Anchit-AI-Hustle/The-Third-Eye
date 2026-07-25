import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

// Reports whether the data layer is persisting to the cloud (server route +
// service-role Supabase) or silently falling back to browser localStorage.
// Powers the "Cloud synced / Local only" badge so a missing service key or a
// signed-out state is visible instead of quietly losing cross-device sync.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ remote: false, reason: "signed-out" }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!getAdminSupabase()) {
    return Response.json({ remote: false, reason: "unconfigured" }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ remote: true, reason: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
