import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { scrapeGmailForUser, scrapeChatForUser } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

// Foreground ingestion: the signed-in app triggers this on open / focus so new
// Gmail + Chat messages are analysed and integrated into the Task Tracker in
// near-real-time, without waiting for the 15-minute cron. Idempotent — the
// dedup ledger makes repeat runs cheap. A short per-user cooldown stops focus
// churn from hammering the Google APIs.
const COOLDOWN_MS = 60_000;
const lastRun = new Map<string, number>();

export async function POST() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const sb = getAdminSupabase();
  if (!sb) return Response.json({ skipped: "not configured" }, { status: 200 });

  const now = Date.now();
  const prev = lastRun.get(email) ?? 0;
  if (now - prev < COOLDOWN_MS) {
    return Response.json({ skipped: "cooldown", retryInMs: COOLDOWN_MS - (now - prev) });
  }
  lastRun.set(email, now);

  const [gmail, chat] = await Promise.all([
    scrapeGmailForUser(sb, email).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
    scrapeChatForUser(sb, email).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
  ]);

  const inserted =
    ((gmail as { inserted?: number }).inserted ?? 0) + ((chat as { inserted?: number }).inserted ?? 0);
  const merged =
    ((gmail as { merged?: number }).merged ?? 0) + ((chat as { merged?: number }).merged ?? 0);

  return Response.json({ gmail, chat, changed: inserted + merged > 0 });
}
