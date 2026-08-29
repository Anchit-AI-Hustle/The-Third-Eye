import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

/**
 * Read model for the Settings → Automations card.
 *
 * Automations (lib/automations.ts) are reminder rows with a `body` (the
 * action) set; plain one-off/recurring reminders from the `set_reminder`
 * tool never set `body`, so that's the filter that separates the two.
 * Pause/resume/delete are plain PATCH/DELETE on /api/data/reminders — this
 * route only exists to join in each automation's last notification attempt,
 * since notification_log is intentionally not in the generic entity
 * allowlist (writes to it must stay server-only).
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const sb = getAdminSupabase();
  if (!sb) return Response.json({ error: "Storage not configured" }, { status: 501 });

  const { data: rows, error } = await sb
    .from("reminders")
    .select("id, title, body, fire_at, recurrence, status")
    .eq("user_id", email)
    .not("body", "is", null)
    .in("status", ["pending", "paused"])
    .order("fire_at", { ascending: true });
  if (error) {
    console.error("automations GET:", error.message);
    return Response.json({ error: "Read failed" }, { status: 500 });
  }
  if (!rows?.length) return Response.json({ automations: [] });

  const ids = rows.map((r) => r.id);
  const { data: logs } = await sb
    .from("notification_log")
    .select("ref_id, channel, status, created_at")
    .eq("user_id", email)
    .eq("kind", "reminder")
    .in("ref_id", ids)
    .order("created_at", { ascending: false });

  const lastRun = new Map<string, { channel: string; status: string; at: string }>();
  for (const l of logs ?? []) {
    if (!lastRun.has(l.ref_id)) lastRun.set(l.ref_id, { channel: l.channel, status: l.status, at: l.created_at });
  }

  const automations = rows.map((r) => ({
    id: r.id,
    name: r.title,
    action: r.body,
    fireAt: r.fire_at,
    recurrence: r.recurrence,
    status: r.status as "pending" | "paused",
    lastRun: lastRun.get(r.id) ?? null,
  }));
  return Response.json({ automations });
}
