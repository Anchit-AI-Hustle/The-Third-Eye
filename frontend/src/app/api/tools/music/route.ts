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

// Text-to-music models render at most seconds→minutes per call. Longer sessions
// (up to 5h) are produced by seamlessly looping a base clip in the player, so we
// cap the actual generated clip to each model's practical maximum.
const INSTRUMENTAL_CLIP_MAX = 120; // stable-audio
const VOCAL_CLIP_MAX = 240;        // ace-step
const MAX_SESSION_SECONDS = 18000; // 5 hours

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
  const sessionSeconds = Math.min(Math.max(Number(i.duration) || 30, 10), MAX_SESSION_SECONDS);
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

  // Only sing if we actually have lyrics — otherwise the vocal model would try to
  // "sing" the raw description. No lyrics → instrumental.
  const sing = vocals && lyrics.trim().length > 0;

  // The clip we actually render; the player loops it to fill the session.
  const clipSeconds = Math.min(sessionSeconds, sing ? VOCAL_CLIP_MAX : INSTRUMENTAL_CLIP_MAX);
  const loopMeta = { sessionSeconds, clipSeconds, loop: sessionSeconds > clipSeconds };
  const instrPromptText = sing ? prompt : `${description}. ${buildTags({ ...i, vocals: false })}`.slice(0, 500);

  // If Replicate isn't configured, fall straight to the free HuggingFace
  // (MusicGen) provider when a token is present; else return the prompt/lyrics.
  if (!replicateConfigured()) {
    const hf = await tryHuggingFaceMusic(instrPromptText, clipSeconds);
    if (hf) return Response.json({ configured: true, done: true, audioUrl: hf, model: "huggingface:musicgen", provider: "huggingface", prompt, tags, lyrics, ...loopMeta });
    return Response.json({ configured: false, prompt, tags, lyrics, note: "Music generation needs REPLICATE_API_TOKEN (or a free HF_API_TOKEN). Here are the style prompt + lyrics to paste into a music tool." });
  }

  // Route to a model that generates from text alone (no reference required).
  async function submitVocal() {
    return createPrediction(VOCAL_MODEL, { tags, lyrics, duration: Math.min(sessionSeconds, VOCAL_CLIP_MAX) });
  }
  async function submitInstrumental() {
    // If we're here because vocals were requested but produced no lyrics, drop the
    // "vocals" wording from the style so the instrumental prompt stays coherent.
    const instrPrompt = sing ? prompt : `${description}. ${buildTags({ ...i, vocals: false })}`.slice(0, 500);
    return createPrediction(INSTRUMENTAL_MODEL, { prompt: instrPrompt, seconds_total: Math.min(sessionSeconds, INSTRUMENTAL_CLIP_MAX) }, INSTRUMENTAL_FALLBACK_VERSION);
  }

  try {
    if (sing) {
      try {
        const p = await submitVocal();
        return Response.json({ configured: true, jobId: p.id, status: p.status, model: VOCAL_MODEL, prompt, tags, lyrics, ...loopMeta });
      } catch {
        const p = await submitInstrumental();
        return Response.json({ configured: true, jobId: p.id, status: p.status, model: INSTRUMENTAL_MODEL, prompt, tags, lyrics, fellBackToInstrumental: true, ...loopMeta, clipSeconds: Math.min(sessionSeconds, INSTRUMENTAL_CLIP_MAX), loop: sessionSeconds > Math.min(sessionSeconds, INSTRUMENTAL_CLIP_MAX) });
      }
    }
    const p = await submitInstrumental();
    return Response.json({ configured: true, jobId: p.id, status: p.status, model: INSTRUMENTAL_MODEL, prompt, tags, lyrics, ...loopMeta });
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
        ...loopMeta, clipSeconds: Math.min(sessionSeconds, INSTRUMENTAL_CLIP_MAX), loop: sessionSeconds > Math.min(sessionSeconds, INSTRUMENTAL_CLIP_MAX),
      });
    }
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
