// The daily drop: every day, a new song in the user's saved style.
//
//   runDaily   — writes today's variation, runs the four-agent pipeline, and
//                submits the song to Replicate with a completion webhook.
//   finalize   — on that webhook (or when the user next looks), fetches the
//                prediction FROM REPLICATE — the webhook body is never trusted —
//                and stores the audio in 1 MiB chunks, because the provider
//                deletes it within the hour.
import { randomBytes } from "crypto";
import type { Db } from "@/lib/db";
import { llmCascade } from "@/lib/llmCascade";
import { sendPush } from "@/lib/push";
import { audioUrlFrom, createPrediction, getPrediction, replicateConfigured } from "@/lib/replicate";
import { planSong } from "./agents";
import { SONG_CLIP_MAX, SONG_MODEL } from "./models";
import type { MusicInput } from "./types";

export const CHUNK = 1024 * 1024;
// Just past a function's 60s lifetime: a holder can't still be working after
// this, so a claim this old belongs to an invocation that died.
const CLAIM_LEASE_MS = 70_000;
const CHAINS = 5;
/** The most user ids one chain link accepts. */
export const CHAIN_MAX = 1000;
export const KEEP_DAYS = 7;
const MAX_AUDIO = 40 * 1024 * 1024;

export interface DailyTrack {
  id: string; user_id: string; day: string; title: string; status: "pending" | "done" | "failed";
  prediction_id: string | null; token: string; created_at: string;
}

// The day a track belongs to, in IST — the timezone the UI promises (the cron
// fires 07:00 IST). In UTC, a "make it now" between midnight and 05:30 IST
// landed on yesterday and the morning cron then made a second track for today.
const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
export const today = (now = new Date()) => IST_DAY.format(now);

function baseUrl(): string | null {
  const explicit = process.env.NEXTAUTH_URL?.replace(/\/+$/, "");
  if (explicit?.startsWith("https://")) return explicit;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : null;
}

/** Today's concept: a new title and theme in the saved style, never one used recently. */
export async function variation(preset: MusicInput, refs: string, recent: string[]): Promise<{ title: string; description: string }> {
  const fallback = { title: `${preset.title || "Daily"} · ${today()}`, description: preset.description || "" };
  try {
    const out = await llmCascade({
      system: [
        "You write the concept for today's new track in a producer's signature style.",
        "Keep the genre, tempo, instrumentation, vocal approach and languages exactly as given; change the story, imagery and hook so it is clearly a new song.",
        'Return ONLY JSON: {"title": "2-4 word title", "description": "2 vivid sentences: the sound and the story"}.',
      ].join("\n"),
      messages: [{
        role: "user",
        content: [
          `Style: ${preset.description ?? ""}`,
          `Genre: ${preset.genre ?? ""}${preset.subgenre ? ` / ${preset.subgenre}` : ""}, ${preset.tempo ?? ""} BPM, mood ${preset.mood ?? ""}`,
          refs ? `The producer's own tracks this should sound like: ${refs}` : "",
          recent.length ? `Titles already used — do not reuse: ${recent.join(", ")}` : "",
        ].filter(Boolean).join("\n"),
      }],
      jsonMode: true, maxTokens: 300, temperature: 0.95, stage: "music:daily",
    });
    const j = JSON.parse(out.text.slice(out.text.indexOf("{"), out.text.lastIndexOf("}") + 1)) as { title?: string; description?: string };
    const title = j.title?.trim();
    const description = j.description?.trim();
    return title && description ? { title: title.slice(0, 80), description: description.slice(0, 600) } : fallback;
  } catch {
    return fallback;
  }
}

export type RunResult = "started" | "exists" | "no-preset" | "unconfigured" | "failed";

export async function runDaily(db: Db, userId: string, day = today()): Promise<RunResult> {
  const base = baseUrl();
  if (!replicateConfigured() || !base) return "unconfigured";

  const { data: saved } = await db.from("music_daily").select("preset, refs").eq("user_id", userId).maybeSingle();
  if (!saved) return "no-preset";
  const { data: already } = await db.from("music_daily_tracks").select("id").eq("user_id", userId).eq("day", day).maybeSingle();
  if (already) return "exists";

  const preset = saved.preset as MusicInput;
  const refs = String(saved.refs ?? "");
  const { data: recentRows } = await db.from("music_daily_tracks").select("title").eq("user_id", userId).order("day", { ascending: false }).limit(14);
  const concept = await variation(preset, refs, (recentRows ?? []).map((r) => r.title as string));

  const input: MusicInput = {
    ...preset,
    ...concept,
    artistInspiration: [preset.artistInspiration, refs].filter(Boolean).join(", "),
  };
  const { brief, plan, sing } = await planSong(input);
  const token = randomBytes(24).toString("hex");

  // (user_id, day) is unique, so a cron run and a "make it now" click racing
  // each other produce one track, not two paid renders.
  const { data: row, error } = await db.from("music_daily_tracks").insert({
    user_id: userId, day, title: concept.title, theme: concept.description,
    tags: plan.tags, lyrics: plan.lyrics, bpm: brief.bpm, token,
  }).select("id").single();
  if (error) return error.code === "23505" ? "exists" : "failed";

  try {
    const p = await createPrediction(
      SONG_MODEL,
      { tags: plan.tags, lyrics: sing ? plan.lyrics : "[instrumental]", duration: Math.min(Math.max(Number(preset.duration) || SONG_CLIP_MAX, 60), SONG_CLIP_MAX) },
      undefined,
      { webhook: `${base}/api/tools/music/daily/webhook?token=${token}` },
    );
    await db.from("music_daily_tracks").update({ prediction_id: p.id }).eq("id", row.id);
  } catch (e) {
    await db.from("music_daily_tracks").update({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "render failed", finished_at: new Date().toISOString() }).eq("id", row.id);
    return "failed";
  }

  const cutoff = today(new Date(Date.now() - KEEP_DAYS * 86_400_000));
  await db.from("music_daily_tracks").delete().eq("user_id", userId).lt("day", cutoff);
  return "started";
}

/** The generator's output host — anything else is not fetched. */
function isReplicateDelivery(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "replicate.delivery" || u.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}

/** Settle a pending track from Replicate's own record of the prediction. */
export async function finalize(db: Db, track: DailyTrack): Promise<DailyTrack["status"]> {
  if (track.status !== "pending" || !track.prediction_id) return track.status;
  const p = await getPrediction(track.prediction_id);
  const fail = async (error: string) => {
    await db.from("music_daily_tracks").update({ status: "failed", error: error.slice(0, 300), finished_at: new Date().toISOString() }).eq("id", track.id).eq("status", "pending");
    return "failed" as const;
  };
  if (p.status === "failed" || p.status === "canceled") return fail(p.error || `Render ${p.status}`);
  if (p.status !== "succeeded") return "pending";

  // Only one caller stores the audio: a webhook retry and the listing's
  // fallback can both reach here, and interleaved delete-and-insert of the same
  // chunks corrupts the file. The lease expires so a crashed claim is retried.
  const { data: claimed } = await db.from("music_daily_tracks")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", track.id).eq("status", "pending")
    .or(`claimed_at.is.null,claimed_at.lt.${new Date(Date.now() - CLAIM_LEASE_MS).toISOString()}`)
    .select("id");
  if (!claimed?.length) return "pending";

  const url = audioUrlFrom(p.output);
  if (!url || !isReplicateDelivery(url)) return fail("The render finished without an audio file.");
  const res = await fetch(url, { redirect: "error" });
  if (!res.ok) return fail(`Could not download the render (HTTP ${res.status}).`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_AUDIO) return fail("The render's audio file was empty or too large.");

  // A claim whose holder died may have left some chunks behind.
  await db.from("music_daily_chunks").delete().eq("track_id", track.id);
  const rows = [];
  for (let n = 0; n * CHUNK < bytes.length; n++) rows.push({ track_id: track.id, n, data: bytes.subarray(n * CHUNK, (n + 1) * CHUNK) });
  for (const r of rows) {
    const { error } = await db.from("music_daily_chunks").insert(r);
    if (error) return fail(`Could not store the audio: ${error.message}`);
  }
  await db.from("music_daily_tracks").update({
    status: "done", size: bytes.length, audio_type: res.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
    finished_at: new Date().toISOString(),
  }).eq("id", track.id);
  await sendPush(track.user_id, "Today's track is ready", track.title, "/tools/music").catch(() => false);
  return "done";
}

/**
 * The daily cron's part: split every enabled user still without today's track
 * into a few chains and start each one. A chain link (`/api/tools/music/daily/run`)
 * makes one user's track in its own invocation, then starts the next link with
 * the rest of its list — so no user waits on another's time budget, and there
 * is no cap on how many get a track.
 */
/** Round-robin the users into at least CHAINS chains, and as many more as keep each within CHAIN_MAX. */
export function splitChains(users: string[]): string[][] {
  const count = Math.min(users.length, Math.max(CHAINS, Math.ceil(users.length / CHAIN_MAX)));
  return Array.from({ length: count }, (_, c) => users.filter((_, i) => i % count === c));
}

export async function dispatchDaily(db: Db): Promise<{ users: number; chains: number; started: number; unstarted: number }> {
  const [{ data: enabled }, { data: done }] = await Promise.all([
    db.from("music_daily").select("user_id").eq("enabled", true),
    db.from("music_daily_tracks").select("user_id").eq("day", today()),
  ]);
  const have = new Set(((done as { user_id: string }[] | null) ?? []).map((r) => r.user_id));
  const users = ((enabled as { user_id: string }[] | null) ?? []).map((r) => r.user_id).filter((u) => !have.has(u));
  const chains = splitChains(users);
  const ok = await Promise.all(chains.map((c) => startChain(c)));
  // Reported, not swallowed: a chain that didn't start is users without today's track.
  const unstarted = chains.filter((_, i) => !ok[i]).reduce((n, c) => n + c.length, 0);
  return { users: users.length, chains: chains.length, started: ok.filter(Boolean).length, unstarted };
}

/**
 * Hand a list of users to the next chain link, retrying a failed hand-off —
 * a dropped hand-off would leave everyone in `users` without today's track.
 * Resolves once a link has accepted the list, or false after the last try.
 */
export async function startChain(users: string[], waits: number[] = [1_000, 3_000]): Promise<boolean> {
  const base = baseUrl();
  const secret = process.env.CRON_SECRET;
  if (!users.length || !base || !secret) return false;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}/api/tools/music/daily/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ users }),
    }).catch(() => null);
    if (res?.status === 202) return true;
    if (attempt >= waits.length) return false;
    await new Promise((r) => setTimeout(r, waits[attempt]));
  }
}
