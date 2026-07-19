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

// ── Lyrics ────────────────────────────────────────────────────────────────
// ace-step (and Suno/Udio) expect lyrics with lowercase section tags on their
// own line: [verse], [chorus], [bridge], [intro], [outro]. Normalise whatever
// the LLM returns into that shape and strip any prose/markdown the model adds.
function cleanLyrics(raw: string): string {
  let t = (raw || "").trim();
  // Drop code fences the model sometimes wraps lyrics in.
  t = t.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  // Drop a leading "Sure, here are..." style preamble (first line before a tag).
  const firstTag = t.search(/\[(intro|verse|pre-?chorus|chorus|bridge|hook|outro|refrain)/i);
  if (firstTag > 0 && /here (are|is)|sure|certainly|below/i.test(t.slice(0, firstTag))) t = t.slice(firstTag);
  return t
    .split("\n")
    .map((line) => {
      // Normalise a section-tag line like "[Chorus 2]" -> "[chorus]" using plain
      // string ops (no backtracking-prone regex on user text).
      const trimmed = line.trim();
      if (trimmed.length > 1 && trimmed.length <= 40 && trimmed[0] === "[" && trimmed.endsWith("]")) {
        let inner = trimmed.slice(1, -1).trim().toLowerCase();
        const parts = inner.split(/\s+/); // split is linear-safe
        if (parts.length > 1 && /^\d{1,3}$/.test(parts[parts.length - 1])) parts.pop();
        inner = parts.join(" ");
        if (inner && /^[a-z][a-z -]{0,20}$/.test(inner)) return `[${inner}]`;
      }
      return line.trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function writeLyrics(i: MusicInput, description: string, tags: string): Promise<string> {
  const structure = i.structure || "Verse - Chorus - Verse - Chorus - Bridge - Chorus";
  const lang = i.vocalLanguage || "English";
  const system = [
    "You are a professional songwriter and topliner who writes for Suno and Udio.",
    "Write original, emotionally resonant, SINGABLE lyrics — concrete imagery, a memorable hook, natural rhyme and consistent meter that a vocalist can actually sing.",
    "Rules:",
    "• Use lowercase section tags on their own line: [intro], [verse], [pre-chorus], [chorus], [bridge], [outro].",
    "• The [chorus] must repeat the same lyric each time it appears (it's the hook).",
    "• 4–6 lines per section. Keep lines short and rhythmic — no rambling.",
    "• Match the requested language, mood and genre. No explicit content unless the theme clearly calls for it.",
    "• Output ONLY the lyrics with their tags. No title, no explanation, no markdown, no quotation marks.",
  ].join("\n");
  const user = [
    `Title: ${i.title || "(untitled)"}`,
    `Theme / brief: ${description}`,
    `Genre & style: ${tags}`,
    i.mood ? `Mood: ${i.mood}` : "",
    i.artistInspiration ? `Vibe reference (do NOT copy any existing lyrics): ${i.artistInspiration}` : "",
    `Language: ${lang}`,
    `Song structure to follow: ${structure}`,
  ].filter(Boolean).join("\n");

  const out = await llmCascade({ system, messages: [{ role: "user", content: user }], maxTokens: 900, temperature: 0.9 });
  return cleanLyrics(out.text);
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
      lyrics = await writeLyrics(i, description, tags);
    } catch { /* proceed without generated lyrics */ }
  }
  if (vocals && i.lyricsMode === "manual") lyrics = cleanLyrics(lyrics);

  if (!replicateConfigured()) {
    return Response.json({ configured: false, prompt, tags, lyrics, note: "Music generation needs REPLICATE_API_TOKEN. Here are the style prompt + lyrics to paste into a music tool." });
  }

  // Route to a model that generates from text alone (no reference required).
  async function submitVocal() {
    return createPrediction(VOCAL_MODEL, { tags, lyrics, duration });
  }
  async function submitInstrumental() {
    // If we're here because vocals were requested but produced no lyrics, drop the
    // "vocals" wording from the style so the instrumental prompt stays coherent.
    const instrPrompt = sing ? prompt : `${description}. ${buildTags({ ...i, vocals: false })}`.slice(0, 500);
    return createPrediction(INSTRUMENTAL_MODEL, { prompt: instrPrompt, seconds_total: duration }, INSTRUMENTAL_FALLBACK_VERSION);
  }

  // Only sing if we actually have lyrics — otherwise the vocal model would try to
  // "sing" the raw description. No lyrics → instrumental.
  const sing = vocals && lyrics.trim().length > 0;

  try {
    if (sing) {
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
