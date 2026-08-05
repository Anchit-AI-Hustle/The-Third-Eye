import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { summarizeDeviceLogs } from "@/lib/deviceLogs";

export const runtime = "nodejs";
export const maxDuration = 60;

// AI Log Sync trigger + status. POST runs the summarization pass over pending
// device logs (LLM call — cooldown-guarded); GET is the cheap status read the
// tracker UI polls.

const COOLDOWN_MS = 5 * 60_000;
const lastRun = new Map<string, number>();

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const sb = getAdminSupabase();
  if (!sb) return Response.json({ pending: 0, lastSummary: null, configured: false });

  const [{ count }, { data: last }] = await Promise.all([
    sb.from("device_logs").select("id", { count: "exact", head: true })
      .eq("user_id", email).eq("processed", false),
    sb.from("activity_log").select("detail, created_at")
      .eq("user_id", email).eq("kind", "log_sync")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const row = last as { detail?: string | null; created_at?: string } | null;
  return Response.json({
    pending: count ?? 0,
    lastSummary: row?.detail ? { text: row.detail, at: row.created_at } : null,
    configured: true,
  });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const now = Date.now();
  const prev = lastRun.get(email) ?? 0;
  if (now - prev < COOLDOWN_MS) {
    return Response.json({ skipped: "cooldown", retryInMs: COOLDOWN_MS - (now - prev) });
  }
  lastRun.set(email, now);

  const result = await summarizeDeviceLogs(email);
  // A too-small batch makes no LLM call — don't burn the cooldown on it, or a
  // user who generates activity right after a no-op warmup is locked out.
  if (result.skipped === "not enough logs") lastRun.delete(email);
  return Response.json({ ...result, changed: result.updated + result.inserted + result.merged > 0 });
}
