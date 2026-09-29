import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { finalize, type DailyTrack } from "@/lib/music/daily";

export const runtime = "nodejs";
export const maxDuration = 60;

// Replicate calls this when a daily track's render completes. The body is not
// read: the unguessable token only says WHICH track, and finalize() asks
// Replicate itself what happened — so a forged call can at most make us check.
export async function POST(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Not found", { status: 404 });
  const db = getDb();
  if (!db) return new Response("Database not configured", { status: 501 });

  const { data } = await db.from("music_daily_tracks").select("id, user_id, day, title, status, prediction_id, token, created_at").eq("token", token).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });
  const status = await finalize(db, data as DailyTrack);
  // Still pending means another finalize holds the track, or the render isn't
  // done: answer non-2xx so Replicate delivers the webhook again, rather than
  // acknowledging a track that nothing may ever store.
  return Response.json({ status }, { status: status === "pending" ? 503 : 200 });
}
