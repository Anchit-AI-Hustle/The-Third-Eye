import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);

  const sb = getAdminSupabase();
  if (!sb) return json({ error: "Sync not configured" }, 501);

  const sub = (await req.json().catch(() => null)) as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | null;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return json({ error: "Invalid subscription" }, 400);
  }

  await sb.from("push_subscriptions").upsert(
    { user_id: email, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    { onConflict: "user_id,endpoint" },
  );
  return json({ ok: true });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
