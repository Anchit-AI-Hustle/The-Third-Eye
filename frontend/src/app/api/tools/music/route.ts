import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { replicateConfigured, createPrediction, getPrediction, audioUrlFrom } from "@/lib/replicate";
import { planSong } from "@/lib/music/agents";
import { SONG_MODEL as VOCAL_MODEL, SONG_CLIP_MAX as VOCAL_CLIP_MAX } from "@/lib/music/models";
import type { MusicInput } from "@/lib/music/types";
import { elevenLabsConfigured, composeElevenLabs, elevenPrompt, clipSecondsFor } from "@/lib/music/elevenlabs";

export const runtime = "nodejs";
// Eleven Music returns the finished song in one call, which can take a few
// minutes for a long clip, so this route gets the full Fluid-compute lifetime.
export const maxDuration = 300;
const LIFETIME_MS = 300_000;

// Real music generation for Music Studio. With ELEVENLABS_API_KEY set, Eleven
// Music (the same engine and key ANCHOR uses) makes the song first, sung or
// instrumental, and returns it in this response. If it is not configured or
// fails, the Replicate routing below runs exactly as before, and the reason
// ElevenLabs failed travels back as `elevenLabsError`. The Replicate routing is a
// faithful port of the MusicGenAI project's:
//   • Instrumental (or vocals off) → stability-ai/stable-audio  { prompt, seconds_total }
//   • Vocals from scratch         → lucataco/ace-step           { tags, lyrics, duration }
// (The production MusicGenAI app also has a GPU-worker segment pipeline + an
//  ElevenLabs path; those need external infra, so here we use the same Replicate
//  providers that generate from text alone — no reference song/voice needed,
//  which is what caused the earlier minimax "reference required" error.)
//   POST → craft style tags + lyrics, submit the job → { jobId, prompt, lyrics, tags }
//   GET ?id=… → poll → { status, audioUrl }

// Instrumental: meta/musicgen is Replicate's official Meta MusicGen — it's a
// base model, so the model-scoped predictions endpoint works without pinning a
// version (the previous "stability-ai/stable-audio" slug no longer exists on
// Replicate, which is what produced the 422 "Invalid version or not permitted").
// stable-audio-open is a solid secondary, addressed by a real, current version.
const INSTRUMENTAL_MODEL = process.env.MUSIC_INSTRUMENTAL_MODEL || "meta/musicgen";
const INSTRUMENTAL_MODEL_VERSION = process.env.MUSIC_INSTRUMENTAL_VERSION || "stereo-large";
const STABLE_AUDIO_MODEL = "stackadoc/stable-audio-open-1.0";
const STABLE_AUDIO_VERSION = "9aff84a639f96d0f7e6081cdea002d15133d0043727f849c40abdd166b7c75a8";

// Text-to-music models render at most seconds→minutes per call. Longer sessions
// (up to 5h) are produced by seamlessly looping a base clip in the player, so we
// cap the actual generated clip to each model's practical maximum.
const INSTRUMENTAL_CLIP_MAX = 60;  // a real mini-composition, not a tiny loop
const STABLE_AUDIO_CLIP_MAX = 47;  // stable-audio-open's native window
const MAX_SESSION_SECONDS = 18000; // 5 hours

async function email() {
  const s = await getServerSession(authOptions);
  return s?.user?.email ?? null;
}

// ── Free fallback: HuggingFace Inference (MusicGen) ─────────────────────────
// When Replicate is unavailable — no token, or exhausted its 429 retries / out
// of credit — try the free HuggingFace serverless Inference API. MusicGen is an
// OPEN instrumental model (see docs/music-models.md), so this covers the
// instrumental path only; it returns raw audio bytes we inline as a data: URI.
// Gated on a token: with no HF key it returns null and the caller keeps the
// existing Replicate behaviour, so this can never break the working path.
function hfToken(): string | null {
  return process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACEHUB_API_TOKEN || null;
}

async function tryHuggingFaceMusic(promptText: string, seconds: number): Promise<string | null> {
  const t = hfToken();
  if (!t) return null;
  const model = process.env.HF_MUSIC_MODEL || "facebook/musicgen-small";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model)) return null;
  // MusicGen renders short clips; keep the HF request modest so it returns
  // within the serverless time budget. The player loops it to fill the session.
  const duration = Math.min(Math.max(Math.round(seconds) || 15, 5), 30);
  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "audio/wav",
        "x-wait-for-model": "true",
      },
      body: JSON.stringify({ inputs: promptText.slice(0, 500), parameters: { duration } }),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return null; // an error/status payload, not audio
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const mime = ct.startsWith("audio/") ? ct.split(";")[0] : "audio/wav";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}


export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  if (!(await email())) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let i: MusicInput;
  try { i = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const description = (i.description ?? "").trim();
  if (!description) return Response.json({ error: "A description is required" }, { status: 400 });
  const sessionSeconds = Math.min(Math.max(Number(i.duration) || 30, 10), MAX_SESSION_SECONDS);

  const { brief, plan, sing } = await planSong(i);
  const { prompt, tags, lyrics } = plan;
  const briefMeta = { brief: { genre: brief.genre, subgenre: brief.subgenre, region: brief.region, era: brief.era, bpm: brief.bpm, moods: brief.moods, energy: brief.energy, instruments: brief.instruments, vocalStyle: brief.vocalStyle, referenceArtists: brief.referenceArtists, culturalContext: brief.culturalContext } };

  // The clip we actually render; the player loops it to fill the session.
  const clipSeconds = Math.min(sessionSeconds, sing ? VOCAL_CLIP_MAX : INSTRUMENTAL_CLIP_MAX);
  const loopMeta = { sessionSeconds, clipSeconds, loop: sessionSeconds > clipSeconds };
  // The Beat-smith prompt is already instrumental-oriented (vocals live in the
  // ace-step tags+lyrics), so it drives the instrumental models + HF fallback.
  const instrPromptText = prompt;

  // Eleven Music first: one call, the finished song back in this response.
  let elevenLabsError: string | undefined;
  if (elevenLabsConfigured()) {
    const elSeconds = clipSecondsFor(sessionSeconds);
    try {
      const el = await composeElevenLabs({
        prompt: elevenPrompt({ prompt, tags, lyrics, sing }),
        seconds: elSeconds, instrumental: !sing,
        deadline: startedAt + LIFETIME_MS - 15_000,
      });
      return Response.json({
        configured: true, done: true, audioUrl: el.audioUrl,
        model: `elevenlabs:${el.model}`, provider: "elevenlabs", songId: el.songId,
        prompt, tags, lyrics, sessionSeconds, clipSeconds: el.seconds, loop: sessionSeconds > el.seconds, ...briefMeta,
      });
    } catch (e) {
      elevenLabsError = e instanceof Error ? e.message : "ElevenLabs failed";
      console.warn(`[music] ElevenLabs failed, falling back: ${elevenLabsError}`);
    }
  }
  const elMeta = elevenLabsError ? { elevenLabsError } : {};

  // If Replicate isn't configured, fall straight to the free HuggingFace
  // (MusicGen) provider when a token is present; else return the prompt/lyrics.
  if (!replicateConfigured()) {
    const hf = await tryHuggingFaceMusic(instrPromptText, clipSeconds);
    if (hf) return Response.json({ configured: true, done: true, audioUrl: hf, model: "huggingface:musicgen", provider: "huggingface", prompt, tags, lyrics, ...loopMeta, ...briefMeta, ...elMeta });
    return Response.json({ configured: false, prompt, tags, lyrics, ...briefMeta, ...elMeta, note: "Music generation needs ELEVENLABS_API_KEY or REPLICATE_API_TOKEN (or a free HF_API_TOKEN). Here are the style prompt + lyrics to paste into a music tool." });
  }

  // Route to a model that generates from text alone (no reference required).
  async function submitVocal() {
    return createPrediction(VOCAL_MODEL, { tags, lyrics, duration: Math.min(sessionSeconds, VOCAL_CLIP_MAX) });
  }
  // Try MusicGen (official, model-scoped) first; on a non-throttle error fall
  // back to stable-audio-open (pinned to a real version). Returns the chosen
  // model name alongside the prediction so the response reflects what ran.
  const instrSecs = Math.min(sessionSeconds, INSTRUMENTAL_CLIP_MAX);
  async function submitInstrumental(): Promise<{ p: Awaited<ReturnType<typeof createPrediction>>; model: string }> {
    try {
      const p = await createPrediction(INSTRUMENTAL_MODEL, {
        prompt: instrPromptText, duration: instrSecs,
        model_version: INSTRUMENTAL_MODEL_VERSION, output_format: "mp3",
      });
      return { p, model: INSTRUMENTAL_MODEL };
    } catch (err) {
      // A 429 throttle is account-wide — the second model would hit it too.
      if (err instanceof Error && /\b429\b|throttled/i.test(err.message)) throw err;
      const p = await createPrediction(STABLE_AUDIO_MODEL, { prompt: instrPromptText, seconds_total: Math.min(instrSecs, STABLE_AUDIO_CLIP_MAX) }, STABLE_AUDIO_VERSION);
      return { p, model: STABLE_AUDIO_MODEL };
    }
  }

  const instrLoop = { ...loopMeta, clipSeconds: instrSecs, loop: sessionSeconds > instrSecs };

  try {
    if (sing) {
      try {
        const p = await submitVocal();
        return Response.json({ configured: true, jobId: p.id, status: p.status, model: VOCAL_MODEL, prompt, tags, lyrics, ...loopMeta, ...briefMeta, ...elMeta });
      } catch (vErr) {
        // Surface WHY the singing model couldn't run — otherwise the user just
        // gets a silent instrumental and calls it "no melody in the lyrics".
        const vocalError = vErr instanceof Error ? vErr.message : "vocal model unavailable";
        const { p, model } = await submitInstrumental();
        return Response.json({ configured: true, jobId: p.id, status: p.status, model, prompt, tags, lyrics, fellBackToInstrumental: true, vocalModel: VOCAL_MODEL, vocalError, ...instrLoop, ...briefMeta, ...elMeta });
      }
    }
    const { p, model } = await submitInstrumental();
    return Response.json({ configured: true, jobId: p.id, status: p.status, model, prompt, tags, lyrics, ...instrLoop, ...briefMeta, ...elMeta });
  } catch (e) {
    // Replicate failed (out of credit, 429 after retries, model error). Before
    // surfacing an error, try the free HuggingFace instrumental fallback so the
    // user still gets audio when an alternate model is available.
    const hf = await tryHuggingFaceMusic(instrPromptText, clipSeconds);
    if (hf) {
      return Response.json({
        configured: true, done: true, audioUrl: hf,
        model: "huggingface:musicgen", provider: "huggingface",
        prompt, tags, lyrics, fellBackToInstrumental: sing,
        ...loopMeta, clipSeconds: Math.min(sessionSeconds, INSTRUMENTAL_CLIP_MAX), loop: sessionSeconds > Math.min(sessionSeconds, INSTRUMENTAL_CLIP_MAX), ...briefMeta, ...elMeta,
      });
    }
    return Response.json({ error: `Music job failed: ${e instanceof Error ? e.message : "unknown"}${elevenLabsError ? ` (ElevenLabs: ${elevenLabsError})` : ""}`, prompt, tags, lyrics, ...elMeta }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await email())) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return Response.json({ error: "valid id required" }, { status: 400 });
  try {
    const p = await getPrediction(id);
    return Response.json({ status: p.status, audioUrl: p.status === "succeeded" ? audioUrlFrom(p.output) : null, error: p.error });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "poll failed" }, { status: 502 });
  }
}
