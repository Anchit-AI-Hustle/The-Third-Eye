import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CHUNK } from "@/lib/music/daily";

export const runtime = "nodejs";

// A daily track's audio, by byte range. A Vercel function can't send a body
// over 4.5 MB, so every answer is at most four stored chunks; <audio> asks for
// ranges on its own, and the Download button fetches them in turn.
const MAX_SPAN = 4 * CHUNK;

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return new Response("Not authenticated", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = getDb();
  if (!db) return new Response("Database not configured", { status: 501 });

  const { data: track } = await db.from("music_daily_tracks").select("size, audio_type, status").eq("id", id).eq("user_id", email).maybeSingle();
  if (!track || track.status !== "done" || !track.size) return new Response("Not found", { status: 404 });
  const size = Number(track.size);

  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "bytes=0-");
  if (!m || (!m[1] && !m[2])) return new Response("Bad range", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  // "bytes=-500" is the LAST 500 bytes.
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  if (start >= size || end < start) return new Response("Bad range", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  end = Math.min(end, size - 1, start + MAX_SPAN - 1);
  start = Math.max(0, start);

  const first = Math.floor(start / CHUNK), last = Math.floor(end / CHUNK);
  const { data: chunks, error } = await db.from("music_daily_chunks").select("n, data").eq("track_id", id).gte("n", first).lte("n", last).order("n");
  if (error || !chunks?.length) return new Response("Audio unavailable", { status: 502 });
  const joined = Buffer.concat((chunks as { data: Buffer }[]).map((c) => c.data));
  const body = joined.subarray(start - first * CHUNK, end - first * CHUNK + 1);

  return new Response(new Uint8Array(body), {
    status: 206,
    headers: {
      "Content-Type": String(track.audio_type || "audio/mpeg"),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(body.length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
