import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { knowledgeContext } from "@/lib/music/knowledge";
import { structuresFor } from "@/lib/music/structures";
import { cleanList, cleanNumber, cleanTempo, cleanValue } from "@/lib/music/normalize";
import { correctSpelling } from "@/lib/textPolish";
import { fallbackLyrics, stripPromptLines } from "@/lib/music/agents";
import {
  backfill, briefOf, echoesBrief, evocativeTitle, expandPrompt, inferGenre, preferGenre, snapMoods, tooClose,
} from "@/lib/music/fieldAssist";

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
      return `Write a single vivid music-generation prompt of 80-180 words as flowing prose. Correct spelling first (psychadelic means psychedelic). Keep the user's genre and intent — expand it, do not switch style and do not return their note unchanged. Cover genre, BPM, instruments, energy, reference artists, and the section arc.`;
    case "title": return "Return a single evocative 2-5 word song title. No quotes. Never use the description, the prompt, or any phrase copied from them as the title.";
    case "genre": return "Return a comma-separated list of 1-3 fitting genres. Name every genre the description actually asks for.";
    case "subgenre": return "Return 1-2 specific sub-genres of the context's genre, comma-separated.";
    case "mood": return "Return 1-2 moods, comma-separated, chosen from: Hypnotic, Driving, Dark, Euphoric, Aggressive, Energetic, Groovy, Ethereal, Chill, Epic, Confident, Intimate, Psychedelic, Relentless, Fierce, Peaceful.";
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
    case "lyricsText": return "Write short, singable, original lyrics with lowercase section tags on their own lines; sparse chants and hooks for club genres. The description is a production brief, not a lyric — do not quote it or reuse any phrase from it as a sung line.";
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
  const value = correctSpelling((body.value ?? "").trim());
  const previous = (body.previous ?? []).slice(-6);
  if (action === "enhance" && !value) return Response.json({ error: "Nothing to enhance yet — type something or use Suggest." }, { status: 400 });

  const brief = briefOf(field, value, body.context);
  const genre = preferGenre(cleanValue(body.context?.genre), inferGenre(brief || value));
  const family = STYLE_FAMILIES[Math.floor((Date.now() / 1000) % STYLE_FAMILIES.length)];
  const ctx = Object.entries({ ...(body.context ?? {}), ...(brief ? { description: brief } : {}), ...(genre ? { genre } : {}) })
    .filter(([, v]) => v != null && String(v).trim())
    .map(([k, v]) => `${k}: ${correctSpelling(String(v))}`).join("; ");

  const actionLine =
    action === "enhance" ? `Enhance and enrich the current value. Correct spelling. Keep its intent and add concrete detail — do not return it unchanged.\nCurrent value: "${value}"`
    : action === "new" ? `Produce a fresh ALTERNATIVE that is clearly different from the current value and from anything tried before.`
    : `Suggest a strong value.`;

  const anchor = genre && genre !== "Electronic"
    ? `The track is ${genre}. Match that genre, mood, tempo and instruments. Do not drift to an unrelated style. A title is never the description.`
    : ctx
    ? `The value MUST be coherent with the user's context above. Do not drift to an unrelated style.`
    : `Anchor loosely to the "${family}" style family for freshness.`;
  const genres = cleanList(genre, 4);
  const grounding = genres.length || brief
    ? `\nGenre knowledge to stay accurate to:\n${knowledgeContext({ genre: genres.join(", "), subgenre: cleanValue(body.context?.subgenre), description: brief })}`
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
      temperature: action === "enhance" ? 0.5 : action === "new" ? 0.95 : 0.7,
      stage: `music:suggest:${field}`,
    });
    const suggestion = finishSuggestion(field, action, value, brief, genre, normalizeSuggestion(field, out.text));
    if (!suggestion) return Response.json({ error: "The suggestion came back empty — try again." }, { status: 502 });
    return Response.json({ field, action, suggestion });
  } catch {
    const suggestion = offlineSuggestion(field, action, value, brief, genre);
    if (suggestion) return Response.json({ field, action, suggestion });
    return Response.json({ error: "Suggestion failed — try again." }, { status: 502 });
  }
}

function finishSuggestion(field: string, action: Action, value: string, brief: string, genre: string, raw: string): string {
  let suggestion = correctSpelling(raw);
  const bf = backfill(brief || value, genre);
  if (field === "title" && (!suggestion || echoesBrief(suggestion, brief || value))) suggestion = evocativeTitle(brief || value || genre, genre, action === "new" ? 1 : 0);
  if ((field === "description" || field === "prompt") && (!suggestion || (action !== "new" && tooClose(suggestion, value)))) suggestion = expandPrompt(value || brief, genre, bf, action === "new" ? 1 : 0);
  if (field === "genre") suggestion = preferGenre(suggestion, inferGenre(brief || value));
  if (field === "mood") suggestion = snapMoods(suggestion) || snapMoods(bf.mood);
  if (field === "lyricsText") {
    suggestion = stripPromptLines(suggestion, brief || value);
    if (!suggestion.split("\n").some((l) => l.trim() && !l.trim().startsWith("["))) {
      suggestion = fallbackLyrics({ description: brief || value, genre, title: evocativeTitle(brief || value, genre), mood: bf.mood });
    }
  }
  return suggestion.trim();
}

function offlineSuggestion(field: string, action: Action, value: string, brief: string, genre: string): string {
  const bf = backfill(brief || value, genre);
  const salt = action === "new" ? 1 : 0;
  switch (field) {
    case "description":
    case "prompt": return expandPrompt(value || brief, genre, bf, salt);
    case "title": return evocativeTitle(brief || value || genre, genre, salt);
    case "genre": return genre;
    case "subgenre": return bf.subgenre;
    case "mood": return snapMoods(bf.mood);
    case "instruments": return bf.instruments;
    case "artistInspiration": return bf.artists;
    case "vocalStyle": return bf.vocalStyle;
    case "tempo": return String(bf.tempo);
    case "energy":
    case "vocalIntensity": return String(bf.energy);
    case "lyricsText": return fallbackLyrics({ description: brief || value, genre, title: evocativeTitle(brief || value, genre, salt), mood: bf.mood });
    default: return "";
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
