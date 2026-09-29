import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { knowledgeContext } from "@/lib/music/knowledge";
import { structuresFor } from "@/lib/music/structures";
import { cleanList, cleanNumber, cleanTempo, cleanValue } from "@/lib/music/normalize";

export const runtime = "nodejs";
export const maxDuration = 30;

// AI auto-suggest — port of MusicGenAI's ai-suggest edge function.
// Per-field Suggest / Enhance / New, with entropy + anti-repetition and the
// Suno/Udio-grade "description" prompt as the crown jewel.

type Action = "suggest" | "enhance" | "new";

const STYLE_FAMILIES = [
  "west-coast hip-hop", "afrobeats", "synthwave", "neo-soul", "drum & bass",
  "indie folk", "latin pop", "cinematic orchestral", "lo-fi house", "K-pop",
  "desert blues", "hyperpop", "bossa nova", "ambient techno", "gospel",
];

// Field-specific instruction. `description` gets the full producer-grade spec.
function fieldInstruction(field: string, genres: string[]): string {
  switch (field) {
    case "description":
    case "prompt":
      return `Write a single vivid music-generation prompt of 120-220 words as flowing prose covering, in order: (1) genre + sub-genre, (2) BPM (exactly the context's tempo when one is given) + key/scale, (3) time signature + groove, (4) chord progression in roman numerals, (5) 5-8 named instruments with stereo placement + frequency role, (6) rhythmic pattern, (7) full vocal chain OR "instrumental, no vocals", (8) production palette with concrete values, (9) 2-3 reference artists + what to take from each, (10) a physical scene/setting, (11) a section-by-section energy arc, (12) mix targets (LUFS, true-peak). Be concrete and original — no clichés, no placeholders.`;
    case "title": return "Return a single evocative 2-5 word song title. No quotes.";
    case "genre": return "Return a comma-separated list of 1-3 fitting genres.";
    case "subgenre": return "Return 1-2 specific sub-genres of the context's genre, comma-separated.";
    case "mood": return "Return a single 1-3 word mood.";
    case "instruments": return "Return 4-8 specific instruments and sound sources idiomatic to the genre, comma-separated.";
    case "artistInspiration": return "Return 1-3 real reference artists from the context's exact scene and sub-genre, comma-separated.";
    case "vocalStyle": return "Return a single concise vocal-style descriptor.";
    case "vocalLanguage": return "Return 1-2 languages the vocals should be sung/spoken in, comma-separated.";
    case "vocalIntensity": return "Return a single whole number from 1 to 10 (1 = soft whisper, 10 = powerful belted performance) fitting the mood and energy.";
    case "vocalEffects": return "Return 1-3 fitting vocal production effects, comma-separated (e.g. reverb, autotune, delay, choir layer, vocoder, distortion).";
    case "structure": return `Return ONE song structure as section names joined by '–'. Prefer one of these genre-idiomatic structures, or adapt one: ${structuresFor(genres).slice(0, 6).join(" | ")}.`;
    case "tempo": return "Return a single whole number: the BPM, between 40 and 400, inside the real range of the context's genre (e.g. full-on psytrance 142-148, hi-tech 175-200, psycore 200-260, speedcore 250-400).";
    case "energy": return "Return a single whole number from 1 to 10 for the track's overall energy.";
    case "duration": return "Return a single number: a fitting length in seconds.";
    case "lyricsText": return "Write short, singable, original lyrics with lowercase section tags on their own lines, following the context's structure; sparse chants and hooks for club genres.";
    default: return "Return one concise, fitting value for this field.";
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { field?: string; value?: string; context?: Record<string, unknown>; action?: Action; previous?: string[] };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const field = body.field ?? "description";
  const action: Action = body.action ?? "suggest";
  const value = (body.value ?? "").trim();
  const previous = (body.previous ?? []).slice(-6);

  // Entropy: rotate a style family and forbid repeating recent suggestions.
  const family = STYLE_FAMILIES[Math.floor((Date.now() / 1000) % STYLE_FAMILIES.length)];
  const ctx = Object.entries(body.context ?? {})
    .filter(([, v]) => v != null && String(v).trim())
    .map(([k, v]) => `${k}: ${v}`).join("; ");

  const actionLine =
    action === "enhance" ? `Enhance and enrich the current value below, keeping its intent but adding concrete detail.\nCurrent value: "${value}"`
    : action === "new" ? `Produce a fresh ALTERNATIVE that is clearly different from the current value and from anything tried before.`
    : `Suggest a strong value.`;

  // When the form already has content (genre/description/mood/etc.), THAT is the
  // anchor — the suggestion must be coherent with what's filled. Only fall back
  // to the rotating style family for freshness when there's no context yet.
  const anchor = ctx
    ? `The value MUST be coherent with the user's context above — match its genre, sub-genre, mood, tempo and instruments. Do not drift to an unrelated style.`
    : `Anchor loosely to the "${family}" style family for freshness.`;
  const genres = cleanList(body.context?.genre, 4);
  const grounding = genres.length || body.context?.description
    ? `\nGenre knowledge to stay accurate to:\n${knowledgeContext({ genre: genres.join(", "), subgenre: cleanValue(body.context?.subgenre), description: cleanValue(body.context?.description) })}`
    : "";
  const system = `You are a world-class music production assistant. ${fieldInstruction(field, genres)}
${anchor} Generate dynamically — never return template/placeholder text. Output ONLY the value, no labels, no commentary, no surrounding quotes.${grounding}`;
  const user = [
    ctx && `Context — ${ctx}.`,
    actionLine,
    previous.length ? `Do NOT repeat any of these previous outputs: ${previous.map((p) => `"${p.slice(0, 60)}"`).join(", ")}.` : "",
  ].filter(Boolean).join("\n");

  try {
    const out = await llmCascade({
      system, messages: [{ role: "user", content: user }],
      maxTokens: field === "description" || field === "prompt" ? 600 : field === "lyricsText" ? 900 : 120,
      // Enhancing keeps the user's intent, so it runs cool; "New" is asked to diverge.
      temperature: action === "enhance" ? 0.5 : action === "new" ? 0.95 : 0.7,
      stage: `music:suggest:${field}`,
    });
    const suggestion = normalizeSuggestion(field, out.text);
    if (!suggestion) return Response.json({ error: "The suggestion came back empty — try again." }, { status: 502 });
    return Response.json({ field, action, suggestion });
  } catch (e) {
    return Response.json({ error: `Suggestion failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
}

const LIST_FIELDS: Record<string, number> = {
  genre: 3, subgenre: 2, mood: 2, instruments: 8, artistInspiration: 3, vocalStyle: 2, vocalLanguage: 4, vocalEffects: 3,
};
const NUMBER_FIELDS: Record<string, [number, number]> = { energy: [1, 10], vocalIntensity: [1, 10], duration: [10, 18000] };

function normalizeSuggestion(field: string, raw: string): string {
  const text = raw.trim();
  if (field === "description" || field === "prompt" || field === "lyricsText") return text.replace(/^["']|["']$/g, "");
  const line = text.split("\n")[0];
  if (field === "tempo") return String(cleanTempo(line) ?? "");
  if (field in NUMBER_FIELDS) return String(cleanNumber(line, ...NUMBER_FIELDS[field]) ?? "");
  if (field in LIST_FIELDS) return cleanList(line, LIST_FIELDS[field]).join(", ");
  return cleanValue(line);
}
