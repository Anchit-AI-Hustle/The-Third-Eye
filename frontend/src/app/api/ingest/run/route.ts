import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { scrapeGmailForUser } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

// Foreground ingestion: the signed-in app triggers this on open / focus so new
// Gmail messages are analysed and integrated into the Task Tracker in
// near-real-time, without waiting for the 15-minute cron. Idempotent — the
// dedup ledger makes repeat runs cheap. A short per-user cooldown stops focus
// churn from hammering the Google APIs.
const COOLDOWN_MS = 60_000;
const lastRun = new Map<string, number>();

export async function POST() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const sb = getDb();
  if (!sb) return Response.json({ skipped: "not configured" }, { status: 200 });

  const now = Date.now();
  const prev = lastRun.get(email) ?? 0;
  if (now - prev < COOLDOWN_MS) {
    return Response.json({ skipped: "cooldown", retryInMs: COOLDOWN_MS - (now - prev) });
  }
  lastRun.set(email, now);

  const gmail = await scrapeGmailForUser(sb, email).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  const { inserted = 0, merged = 0 } = gmail as { inserted?: number; merged?: number };

  return Response.json({ gmail, changed: inserted + merged > 0 });
}
