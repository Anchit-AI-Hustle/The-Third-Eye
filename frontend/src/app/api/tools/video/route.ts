import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { replicateConfigured, createPrediction, getPrediction, videoUrlFrom } from "@/lib/replicate";
import { planScenes } from "@/lib/videoScenes";

export const runtime = "nodejs";
export const maxDuration = 60;

// Real clip rendering for the Video Studio — the same submit-then-poll shape as
// /api/tools/music, on the same REPLICATE_API_TOKEN.
//   POST { script }            → shot list only, no spend    → { scenes }
//   POST { script, sceneIndex }→ render that one clip        → { jobId, status, scene }
//   GET  ?id=…                 → poll                        → { status, videoUrl }
//
// One clip per request, one click per clip. Text-to-video is the only thing in
// this app that costs real money per call, so nothing here renders in bulk or
// on its own — an episode is the user pressing Render N times, deliberately.

const VIDEO_MODEL = process.env.VIDEO_MODEL || "bytedance/seedance-1-lite";
const VIDEO_RESOLUTION = process.env.VIDEO_RESOLUTION || "480p";
const VIDEO_ASPECT = process.env.VIDEO_ASPECT || "16:9";

async function email() {
  const s = await getServerSession(authOptions);
  return s?.user?.email ?? null;
}

export async function POST(req: NextRequest) {
  if (!(await email())) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { script?: string; sceneIndex?: number };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const script = (body.script ?? "").trim();
  if (!script) return Response.json({ error: "A script is required" }, { status: 400 });

  let scenes;
  try {
    ({ scenes } = await planScenes(script));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Shot list failed" }, { status: 502 });
  }

  // No sceneIndex → plan only. Free, and it's what the UI asks for first.
  if (body.sceneIndex == null) {
    return Response.json({ scenes, configured: replicateConfigured() });
  }

  const idx = Number(body.sceneIndex);
  const scene = Number.isInteger(idx) ? scenes[idx] : undefined;
  if (!scene) return Response.json({ error: "Unknown scene" }, { status: 400 });

  if (!replicateConfigured()) {
    return Response.json({ error: "Clip rendering needs REPLICATE_API_TOKEN. The shot list above is ready to paste into a video tool." }, { status: 501 });
  }

  try {
    const p = await createPrediction(VIDEO_MODEL, {
      prompt: scene.prompt,
      duration: scene.seconds,
      resolution: VIDEO_RESOLUTION,
      aspect_ratio: VIDEO_ASPECT,
    });
    return Response.json({ jobId: p.id, status: p.status, model: VIDEO_MODEL, scene });
  } catch (e) {
    return Response.json({ error: `Clip job failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await email())) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return Response.json({ error: "valid id required" }, { status: 400 });
  try {
    const p = await getPrediction(id);
    return Response.json({ status: p.status, videoUrl: p.status === "succeeded" ? videoUrlFrom(p.output) : null, error: p.error });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "poll failed" }, { status: 502 });
  }
}
