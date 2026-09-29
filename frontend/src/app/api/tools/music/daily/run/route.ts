import { NextRequest, after } from "next/server";
import { getDb } from "@/lib/db";
import { runDaily, startChain } from "@/lib/music/daily";

export const runtime = "nodejs";
export const maxDuration = 60;

// One link of a daily-drop chain (see dispatchDaily): accept the list, hand the
// rest to the next link, then make the first user's track. The hand-off comes
// first so a render that hangs or outlives this invocation can't strand the
// users behind it.
// Server-to-server only — the cron secret is the credential.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const db = getDb();
  if (!db) return new Response("Database not configured", { status: 501 });

  let users: unknown;
  try { ({ users } = await req.json()); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!Array.isArray(users) || !users.length || users.length > 1000 || !users.every((u) => typeof u === "string" && u.length > 0 && u.length <= 320)) {
    return new Response("users must be a non-empty list of ids", { status: 400 });
  }
  const [head, ...rest] = users as string[];
  after(async () => {
    await startChain(rest);
    await runDaily(db, head).catch(() => "failed");
  });
  return new Response(null, { status: 202 });
}
