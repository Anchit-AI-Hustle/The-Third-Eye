import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { replicateConfigured, createPrediction, getPrediction, audioUrlFrom } from "@/lib/replicate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Real music generation for Creative Studio.
//   POST → generate style prompt (+ lyrics for vocal tracks) via the LLM cascade,
//          then submit a Replicate audio job. Returns { jobId, prompt, lyrics }.
//   GET ?id=… → poll the job; returns { status, audioUrl }.
// Instrumental uses meta/musicgen (reliable text→music); vocal songs use a
// lyrics-capable model (configurable). Powered by REPLICATE_API_TOKEN, copied
// from the music-gen project's Vercel env.

const INSTRUMENTAL_MODEL = process.env.MUSIC_MODEL || "meta/musicgen";
const SONG_MODEL = process.env.MUSIC_SONG_MODEL || "minimax/music-01";

async function auth() {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

export async function POST(req: NextRequest) {
  if (!(await auth())) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { brief?: string; genre?: string; mood?: string; vocals?: boolean; duration?: number; lyrics?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const brief = (body.brief ?? "").trim();
  if (!brief) return Response.json({ error: "A description is required" }, { status: 400 });
  const vocals = body.vocals !== false;
  const duration = Math.min(Math.max(Number(body.duration) || 20, 5), 60);
  const style = [body.genre, body.mood].filter(Boolean).join(", ");

  // 1) Craft a music-model style prompt (+ lyrics when the track has vocals).
  let prompt = brief;
  let lyrics = (body.lyrics ?? "").trim();
  try {
    const out = await llmCascade({
      system: "You turn a brief into inputs for a text-to-music model. Return ONLY JSON: {\"prompt\": string, \"lyrics\": string}. `prompt` is a vivid one-line style description (genre, instrumentation, tempo/BPM, mood). `lyrics` are short structured lyrics with [Verse]/[Chorus] (empty string if instrumental).",
      messages: [{ role: "user", content: `Brief: ${brief}\nStyle: ${style || "(none given)"}\nVocals: ${vocals ? "yes" : "instrumental only"}` }],
      jsonMode: true, maxTokens: 600, temperature: 0.7,
    });
    const parsed = JSON.parse(out.text);
    if (parsed.prompt) prompt = String(parsed.prompt);
    if (vocals && !lyrics && parsed.lyrics) lyrics = String(parsed.lyrics);
  } catch { /* fall back to the raw brief as the prompt */ }

  // 2) Submit the audio job (graceful if Replicate isn't configured).
  if (!replicateConfigured()) {
    return Response.json({
      configured: false, prompt, lyrics,
      note: "Music generation needs REPLICATE_API_TOKEN in the environment. Here are the generated prompt + lyrics you can paste into a music tool.",
    });
  }

  try {
    const model = vocals ? SONG_MODEL : INSTRUMENTAL_MODEL;
    const input: Record<string, unknown> = vocals
      ? { lyrics: lyrics || brief, prompt, song_prompt: prompt }
      : { prompt, duration, output_format: "mp3" };
    const pred = await createPrediction(model, input);
    return Response.json({ configured: true, jobId: pred.id, status: pred.status, model, prompt, lyrics });
  } catch (e) {
    // If the vocal model rejects the input shape, retry once as instrumental.
    if (vocals) {
      try {
        const pred = await createPrediction(INSTRUMENTAL_MODEL, { prompt, duration, output_format: "mp3" });
        return Response.json({ configured: true, jobId: pred.id, status: pred.status, model: INSTRUMENTAL_MODEL, prompt, lyrics, fellBackToInstrumental: true });
      } catch { /* fall through to error */ }
    }
    return Response.json({ error: `Music job failed: ${e instanceof Error ? e.message : "unknown"}`, prompt, lyrics }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await auth())) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    const p = await getPrediction(id);
    return Response.json({
      status: p.status,
      audioUrl: p.status === "succeeded" ? audioUrlFrom(p.output) : null,
      error: p.error,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "poll failed" }, { status: 502 });
  }
}
