import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { creditsRefused, refundCredits, refundJobOnce, spendCredits } from "@/lib/credits";
import { replicateConfigured, createPrediction, getPrediction, videoUrlFrom, audioUrlFrom } from "@/lib/replicate";
import { MAX_REEL_SECONDS, planScenes } from "@/lib/videoScenes";

export const runtime = "nodejs";
export const maxDuration = 60;

// Real clip rendering for the Video Studio — the same submit-then-poll shape as
// /api/tools/music, on the same REPLICATE_API_TOKEN.
//   POST { script, seconds? }      → shot list only, no spend → { scenes }
//   POST { scene: {prompt,seconds,aspect?}} → render that one clip → { jobId, status }
//   POST { narration }             → voice that one line       → { jobId, status }
//   GET  ?id=…                     → poll                      → { status, url }
//
// One job per request, one click per job. Text-to-video is the only thing in
// this app that costs real money per call, so nothing here renders in bulk or
// on its own. The client sends back the shot it is showing rather than the
// script, so what renders is exactly what the user pressed Render on.

const VIDEO_MODEL = process.env.VIDEO_MODEL || "bytedance/seedance-1-lite";
const VIDEO_RESOLUTION = process.env.VIDEO_RESOLUTION || "480p";
const VIDEO_ASPECT = process.env.VIDEO_ASPECT || "16:9";
const ASPECTS = new Set(["16:9", "9:16", "1:1"]);
const TTS_MODEL = process.env.TTS_MODEL || "jaaari/kokoro-82m";
const TTS_VOICE = process.env.TTS_VOICE || "am_michael";

async function email() {
  const s = await getServerSession(authOptions);
  return s?.user?.email ?? null;
}

type Body = { script?: unknown; seconds?: unknown; scene?: unknown; narration?: unknown };

export async function POST(req: NextRequest) {
  const user = await email();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });

  if (body.scene === undefined && body.narration === undefined) {
    const script = typeof body.script === "string" ? body.script.trim() : "";
    if (!script) return Response.json({ error: "A script is required" }, { status: 400 });
    // A reel's running time; the shots are fitted to add up to exactly it.
    const seconds = body.seconds === undefined ? undefined : Number(body.seconds);
    if (seconds !== undefined && !(Number.isInteger(seconds) && seconds >= 8 && seconds <= MAX_REEL_SECONDS)) {
      return Response.json({ error: `A reel can be 8-${MAX_REEL_SECONDS} seconds.` }, { status: 400 });
    }
    try {
      const { scenes } = await planScenes(script, seconds);
      return Response.json({ scenes, configured: replicateConfigured() });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Shot list failed" }, { status: 502 });
    }
  }

  let model: string;
  let input: Record<string, unknown>;
  if (body.scene !== undefined) {
    const scene = (body.scene && typeof body.scene === "object" ? body.scene : {}) as { prompt?: unknown; seconds?: unknown; aspect?: unknown };
    const prompt = typeof scene.prompt === "string" ? scene.prompt.trim() : "";
    const seconds = Number(scene.seconds);
    if (!prompt || prompt.length > 1500 || !Number.isInteger(seconds) || seconds < 4 || seconds > 8) {
      return Response.json({ error: "A shot needs a prompt and 4-8 seconds" }, { status: 400 });
    }
    model = VIDEO_MODEL;
    const aspect = typeof scene.aspect === "string" && ASPECTS.has(scene.aspect) ? scene.aspect : VIDEO_ASPECT;
    input = { prompt, duration: seconds, resolution: VIDEO_RESOLUTION, aspect_ratio: aspect };
  } else {
    const text = typeof body.narration === "string" ? body.narration.trim() : "";
    if (!text || text.length > 400) return Response.json({ error: "Narration must be 1-400 characters" }, { status: 400 });
    model = TTS_MODEL;
    input = { text, voice: TTS_VOICE, speed: 1 };
  }

  if (!replicateConfigured()) {
    return Response.json({ error: "AI clip rendering is not available right now. Build episode file still turns the shot list into a finished video." }, { status: 501 });
  }
  // Clips are the paid render; a narration line costs a fraction of a cent.
  const spend = body.scene !== undefined ? await spendCredits(user, "video.render") : null;
  if (spend && !spend.ok) return creditsRefused(spend);
  try {
    const p = await createPrediction(model, input);
    return Response.json({ jobId: p.id, status: p.status, model });
  } catch (e) {
    if (spend) await refundCredits(user, spend, "video.render");
    return Response.json({ error: `Render job failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const user = await email();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  // Only clip renders are charged; narration polls omit `charged` so we never
  // invent a refund for a free TTS job.
  const charged = q.get("charged") === "video.render";
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return Response.json({ error: "valid id required" }, { status: 400 });
  try {
    const p = await getPrediction(id);
    if (p.status === "failed" || p.status === "canceled") {
      const refunded = charged ? await refundJobOnce(user, "video.render", id) : false;
      return Response.json({ status: p.status, url: null, error: p.error || `Render ${p.status}`, refunded });
    }
    if (p.status !== "succeeded") {
      return Response.json({ status: p.status, url: null, error: p.error });
    }
    const url = videoUrlFrom(p.output) ?? audioUrlFrom(p.output);
    if (!url) {
      const refunded = charged ? await refundJobOnce(user, "video.render", id) : false;
      return Response.json({ status: "failed", url: null, error: "The render finished without a media file.", refunded });
    }
    return Response.json({ status: "succeeded", url, error: null });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "poll failed" }, { status: 502 });
  }
}
