import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";

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
function fieldInstruction(field: string): string {
  switch (field) {
    case "description":
    case "prompt":
      return `Write a single vivid music-generation prompt of 120-220 words as flowing prose covering, in order: (1) genre + sub-genre, (2) BPM + key/scale, (3) time signature + groove, (4) chord progression in roman numerals, (5) 5-8 named instruments with stereo placement + frequency role, (6) rhythmic pattern, (7) full vocal chain OR "instrumental, no vocals", (8) production palette with concrete values, (9) 2-3 reference artists + what to take from each, (10) a physical scene/setting, (11) a section-by-section energy arc, (12) mix targets (LUFS, true-peak). Be concrete and original — no clichés, no placeholders.`;
    case "title": return "Return a single evocative 2-5 word song title. No quotes.";
    case "genre": return "Return a comma-separated list of 1-3 fitting genres.";
    case "subgenre": return "Return 1-2 specific sub-genres, comma-separated.";
    case "mood": return "Return a single 1-3 word mood.";
    case "instruments": return "Return 4-6 specific instruments, comma-separated.";
    case "artistInspiration": return "Return 1-2 reference artists, comma-separated.";
    case "vocalStyle": return "Return a single concise vocal-style descriptor.";
    case "structure": return "Return a song structure as section names joined by ' → '.";
    case "lyricsText": return "Write short, singable lyrics with [Verse]/[Chorus] tags.";
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
  const system = `You are a world-class music production assistant. ${fieldInstruction(field)}
${anchor} Generate dynamically — never return template/placeholder text. Output ONLY the value, no labels, no commentary, no surrounding quotes.`;
  const user = [
    ctx && `Context — ${ctx}.`,
    actionLine,
    previous.length ? `Do NOT repeat any of these previous outputs: ${previous.map((p) => `"${p.slice(0, 60)}"`).join(", ")}.` : "",
  ].filter(Boolean).join("\n");

  try {
    const out = await llmCascade({
      system, messages: [{ role: "user", content: user }],
      maxTokens: field === "description" || field === "prompt" ? 600 : 120,
      temperature: 0.95,
    });
    let suggestion = out.text.trim().replace(/^["']|["']$/g, "");
    if (field !== "description" && field !== "prompt" && field !== "lyricsText") suggestion = suggestion.split("\n")[0].trim();
    return Response.json({ field, action, suggestion });
  } catch (e) {
    return Response.json({ error: `Suggestion failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
}
