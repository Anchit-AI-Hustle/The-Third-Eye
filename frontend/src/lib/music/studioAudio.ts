// Music Studio audio kept in Postgres, in 1 MiB chunks, the way the daily drop
// keeps its tracks (see supabase/migrations/20261004000000_music_studio_audio.sql).
// A song made by Eleven Music exists only in the response that delivered it, so
// it is stored here and played back by byte range from
// /api/tools/music/audio/<id>; saved library rows hold only that short path.
// Replicate (and HF) outputs expire within ~1h, so poll/POST also download and
// store here before the Studio saves a library URL.
import type { Db } from "@/lib/db";
import { CHUNK } from "./daily";

export const MAX_STUDIO_AUDIO = 20 * 1024 * 1024;

export const audioPath = (id: string) => `/api/tools/music/audio/${id}`;

/** Store one song for one user. Returns its id, or throws with the reason. */
export async function storeStudioAudio(
  db: Db, userId: string, bytes: Buffer,
  meta: { audioType?: string; provider?: string; songId?: string | null } = {},
): Promise<string> {
  if (!bytes.length || bytes.length > MAX_STUDIO_AUDIO) throw new Error("audio is empty or too large to store");
  const { data: row, error } = await db.from("music_studio_audio").insert({
    user_id: userId, size: bytes.length,
    audio_type: meta.audioType || "audio/mpeg", provider: meta.provider || "elevenlabs", song_id: meta.songId ?? null,
  }).select("id").single();
  if (error || !row?.id) throw new Error(`could not store the audio: ${error?.message ?? "no id"}`);
  const id = String(row.id);
  for (let n = 0; n * CHUNK < bytes.length; n++) {
    const { error: e } = await db.from("music_studio_audio_chunks").insert({ audio_id: id, n, data: bytes.subarray(n * CHUNK, (n + 1) * CHUNK) });
    if (e) {
      await db.from("music_studio_audio").delete().eq("id", id); // chunks go with it
      throw new Error(`could not store the audio: ${e.message}`);
    }
  }
  return id;
}

/** HTTPS hosts we will fetch audio from (Replicate delivery CDN). */
export function isReplicateDelivery(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "replicate.delivery" || u.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}

/**
 * Download remote (or data:) audio and store it. Returns a durable /api/tools/music/audio/:id
 * path, or null when there is no DB / download fails (caller may keep the ephemeral URL).
 */
export async function persistStudioRemoteAudio(
  db: Db, userId: string, source: string,
  meta: { provider?: string; songId?: string | null } = {},
): Promise<string | null> {
  let bytes: Buffer;
  let mime = "audio/mpeg";
  if (source.startsWith("data:")) {
    const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(source);
    if (!m) return null;
    mime = m[1] || mime;
    bytes = Buffer.from(m[2], "base64");
  } else if (isReplicateDelivery(source)) {
    const res = await fetch(source, { redirect: "error" });
    if (!res.ok) return null;
    bytes = Buffer.from(await res.arrayBuffer());
    mime = res.headers.get("content-type")?.split(";")[0] || mime;
  } else {
    return null;
  }
  if (!bytes.length || bytes.length > MAX_STUDIO_AUDIO) return null;
  try {
    return audioPath(await storeStudioAudio(db, userId, bytes, { audioType: mime, provider: meta.provider, songId: meta.songId }));
  } catch {
    return null;
  }
}
