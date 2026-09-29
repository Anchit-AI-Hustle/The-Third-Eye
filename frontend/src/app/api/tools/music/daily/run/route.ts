import { NextRequest, after } from "next/server";
import { getDb } from "@/lib/db";
import { workOnce } from "@/lib/music/daily";

export const runtime = "nodejs";
export const maxDuration = 60;

// One daily-drop worker turn (see dispatchDaily): claim one queued user, make
// their track, then start the next worker. Server-to-server only — the cron
// secret is the credential. The queue lives in the database, so nothing here
// is lost if this invocation dies: the claim expires and another worker, or
// the next daily sweep, takes the user.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const db = getDb();
  if (!db) return new Response("Database not configured", { status: 501 });
  after(() => workOnce(db));
  return new Response(null, { status: 202 });
}
