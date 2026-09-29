import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { finalize, runDaily, KEEP_DAYS, type DailyTrack } from "@/lib/music/daily";
import type { MusicInput } from "@/lib/music/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// The daily drop, for the signed-in user.
//   GET  → saved style + the last week's tracks
//   PUT  { enabled, preset, refs } → save the style the cron will follow
//   POST → make today's track now instead of waiting for the cron

async function ctx() {
  const email = (await getServerSession(authOptions))?.user?.email;
  const db = getDb();
  return { email, db };
}

const TRACK_COLUMNS = "id, user_id, day, title, theme, lyrics, bpm, status, error, size, prediction_id, token, created_at";

export async function GET() {
  const { email, db } = await ctx();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!db) return Response.json({ error: "Database not configured" }, { status: 501 });

  const [{ data: settings }, { data: rows }] = await Promise.all([
    db.from("music_daily").select("enabled, preset, refs, updated_at").eq("user_id", email).maybeSingle(),
    db.from("music_daily_tracks").select(TRACK_COLUMNS).eq("user_id", email).order("day", { ascending: false }).limit(KEEP_DAYS),
  ]);

  // The webhook is the normal path; this catches a render whose webhook never
  // arrived, while Replicate still holds the output (about an hour).
  const tracks = (rows ?? []) as (DailyTrack & Record<string, unknown>)[];
  for (const t of tracks.filter((x) => x.status === "pending" && Date.now() - Date.parse(x.created_at) > 120_000).slice(0, 2)) {
    t.status = await finalize(db, t).catch(() => t.status);
  }
  return Response.json({
    settings,
    tracks: tracks.map(({ token: _t, prediction_id: _p, user_id: _u, ...rest }) => rest),
  });
}

export async function PUT(req: NextRequest) {
  const { email, db } = await ctx();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!db) return Response.json({ error: "Database not configured" }, { status: 501 });

  let body: { enabled?: unknown; preset?: unknown; refs?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const preset = body.preset as MusicInput | undefined;
  if (!preset || typeof preset !== "object" || typeof preset.description !== "string" || !preset.description.trim()) {
    return Response.json({ error: "Save a style with a music prompt first" }, { status: 400 });
  }
  if (JSON.stringify(preset).length > 20_000) return Response.json({ error: "That style is too large to save" }, { status: 400 });

  const { error } = await db.from("music_daily").upsert({
    user_id: email,
    enabled: body.enabled !== false,
    preset,
    refs: typeof body.refs === "string" ? body.refs.trim().slice(0, 300) : "",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return Response.json({ error: "Could not save the daily style" }, { status: 500 });
  return Response.json({ ok: true });
}

const RUN_MESSAGES = {
  started: "Today's track is being made — it will appear here in a few minutes.",
  exists: "Today's track has already been made.",
  "no-preset": "Save a daily style first.",
  unconfigured: "Daily tracks need REPLICATE_API_TOKEN and a production URL.",
  failed: "Couldn't start today's track — try again.",
} as const;

export async function POST() {
  const { email, db } = await ctx();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!db) return Response.json({ error: "Database not configured" }, { status: 501 });
  const result = await runDaily(db, email);
  const status = result === "started" || result === "exists" ? 200 : result === "unconfigured" ? 501 : result === "no-preset" ? 400 : 502;
  return Response.json({ result, message: RUN_MESSAGES[result] }, { status });
}
