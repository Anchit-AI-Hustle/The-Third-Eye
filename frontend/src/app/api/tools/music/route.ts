import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { replicateConfigured, createPrediction, getPrediction, audioUrlFrom } from "@/lib/replicate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Real music generation for Music Studio — a faithful port of the MusicGenAI
// project's Replicate routing:
//   • Instrumental (or vocals off) → stability-ai/stable-audio  { prompt, seconds_total }
//   • Vocals from scratch         → lucataco/ace-step           { tags, lyrics, duration }
// (The production MusicGenAI app also has a GPU-worker segment pipeline + an
//  ElevenLabs path; those need external infra, so here we use the same Replicate
//  providers that generate from text alone — no reference song/voice needed,
//  which is what caused the earlier minimax "reference required" error.)
//   POST → craft style tags + lyrics, submit the job → { jobId, prompt, lyrics, tags }
//   GET ?id=… → poll → { status, audioUrl }

const INSTRUMENTAL_MODEL = "stability-ai/stable-audio";
const INSTRUMENTAL_FALLBACK_VERSION = "812b1cc162cb5f69ec9873d611ee67e3fd04be85160d5ed703bc984d72d24403";
const VOCAL_MODEL = process.env.MUSIC_SONG_MODEL || "lucataco/ace-step";

interface MusicInput {
  title?: string; description?: string; genre?: string; subgenre?: string; mood?: string;
  tempo?: number; duration?: number; vocals?: boolean; vocalStyle?: string; vocalLanguage?: string;
  lyricsMode?: "auto" | "manual" | "none"; lyricsText?: string; artistInspiration?: string;
  instruments?: string; energy?: number; structure?: string;
}

async function email() {
  const s = await getServerSession(authOptions);
  return s?.user?.email ?? null;
}

// Build a rich, descriptive style string (tags) the way the music-gen project does.
function buildTags(i: MusicInput): string {
  return [
    i.genre, i.subgenre, i.mood && `${i.mood} mood`,
    i.tempo && `${i.tempo} BPM`,
    i.energy != null && `energy ${i.energy}/10`,
    i.instruments, i.structure,
    i.artistInspiration && `in the style of ${i.artistInspiration}`,
    i.vocals ? `${i.vocalStyle || "expressive"} ${i.vocalLanguage || "English"} vocals` : "instrumental, no vocals",
  ].filter(Boolean).join(", ");
}

export async function POST(req: NextRequest) {
  if (!(await email())) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let i: MusicInput;
  try { i = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const description = (i.description ?? "").trim();
  if (!description) return Response.json({ error: "A description is required" }, { status: 400 });
  const vocals = i.vocals !== false && i.lyricsMode !== "none";
  const duration = Math.min(Math.max(Number(i.duration) || 30, 10), 120);
  const tags = buildTags(i);
  const prompt = `${description}. ${tags}`.slice(0, 500);

  // Lyrics: use provided (manual) or generate (auto) via the cascade; none if instrumental.
  let lyrics = (i.lyricsText ?? "").trim();
  if (vocals && i.lyricsMode !== "manual") {
    try {
      const out = await llmCascade({
        system: "Write concise, singable song lyrics with [Verse]/[Chorus]/[Bridge] tags. Return ONLY the lyrics, no commentary.",
        messages: [{ role: "user", content: `Song: ${i.title || description}\nStyle: ${tags}\nLanguage: ${i.vocalLanguage || "English"}\nTheme: ${description}` }],
        maxTokens: 500, temperature: 0.8,
      });
      lyrics = out.text.trim();
    } catch { /* proceed without generated lyrics */ }
  }

  if (!replicateConfigured()) {
    return Response.json({ configured: false, prompt, tags, lyrics, note: "Music generation needs REPLICATE_API_TOKEN. Here are the style prompt + lyrics to paste into a music tool." });
  }

  // Route to a model that generates from text alone (no reference required).
  async function submitVocal() {
    return createPrediction(VOCAL_MODEL, { tags, lyrics: lyrics || description, duration });
  }
  async function submitInstrumental() {
    return createPrediction(INSTRUMENTAL_MODEL, { prompt, seconds_total: duration }, INSTRUMENTAL_FALLBACK_VERSION);
  }

  try {
    if (vocals) {
      try {
        const p = await submitVocal();
        return Response.json({ configured: true, jobId: p.id, status: p.status, model: VOCAL_MODEL, prompt, tags, lyrics });
      } catch {
        const p = await submitInstrumental();
        return Response.json({ configured: true, jobId: p.id, status: p.status, model: INSTRUMENTAL_MODEL, prompt, tags, lyrics, fellBackToInstrumental: true });
      }
    }
    const p = await submitInstrumental();
    return Response.json({ configured: true, jobId: p.id, status: p.status, model: INSTRUMENTAL_MODEL, prompt, tags, lyrics });
  } catch (e) {
    return Response.json({ error: `Music job failed: ${e instanceof Error ? e.message : "unknown"}`, prompt, tags, lyrics }, { status: 502 });
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
