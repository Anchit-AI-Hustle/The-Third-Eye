// The four-agent music pipeline. Each agent is a specialised, cascaded LLM call
// (llmCascade → multi-provider fallback), so the whole pipeline keeps working on
// free keys alone. Orchestrated by route.ts:
//
//   Musicologist ──▶ Beat-smith ─┐
//        │                       ├──▶ Conductor ──▶ FinalPlan
//        └──────────▶ Lyricist ──┘
//
// The Musicologist grounds everything in the universal knowledge base; the
// Beat-smith designs the arrangement + model prompt; the Lyricist writes lyrics
// that fit; the Conductor synchronises them into one coherent generation.

import { llmCascade } from "@/lib/llmCascade";
import { knowledgeContext, lookupGenres } from "./knowledge";
import type { MusicInput, MusicBrief, BeatSpec, FinalPlan } from "./types";

// Pull the first {...} JSON object out of an LLM response (defensive parse).
function parseJson<T>(text: string, fallback: T): T {
  try { return JSON.parse(text) as T; } catch { /* try to extract */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { /* give up */ }
  }
  return fallback;
}

const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

// ── Agent 1: Musicologist ──────────────────────────────────────────────────
// Understands music worldwide/through history; turns the request into a
// grounded brief using the knowledge base + its own training.
export async function musicologist(i: MusicInput): Promise<MusicBrief> {
  const kb = knowledgeContext(i);
  const system = [
    "You are a world-class musicologist and ethnomusicologist with encyclopaedic knowledge of every genre across the world and through history — its origins, instrumentation, rhythm, structure, and cultural context.",
    "Given a music request and knowledge-base grounding, produce a precise musical BRIEF the production team will build from.",
    "Honour the user's explicit choices (genre, tempo, instruments, mood) but enrich them with accurate, genre-idiomatic detail. Blend genres faithfully when several are named (e.g. 'hard techno + psy acid' = fast distorted kicks + rolling acid basslines).",
    "Output ONLY a JSON object — no prose, no markdown — with keys:",
    "genre, subgenre, region, era, bpm (number), timeSignature, key, instruments (string[]), structure (string), moods (string[]), energy (1-10 number), vocalStyle (string; 'instrumental' if no vocals), referenceArtists (string[]; for feel only), culturalContext (1-2 sentences), productionNotes (string).",
  ].join("\n");
  const user = [
    `Request: ${i.description || "(none)"}`,
    i.title ? `Title: ${i.title}` : "",
    i.genre ? `Genre: ${i.genre}` : "",
    i.subgenre ? `Subgenre: ${i.subgenre}` : "",
    i.mood ? `Mood: ${i.mood}` : "",
    i.tempo ? `Tempo hint: ${i.tempo} BPM` : "",
    i.instruments ? `Instruments hint: ${i.instruments}` : "",
    i.energy != null ? `Energy hint: ${i.energy}/10` : "",
    i.structure ? `Structure hint: ${i.structure}` : "",
    i.artistInspiration ? `Vibe reference: ${i.artistInspiration}` : "",
    i.vocals === false ? "Vocals: instrumental" : i.vocalStyle ? `Vocals: ${i.vocalStyle} (${i.vocalLanguage || "English"})` : "",
    "",
    "KNOWLEDGE BASE:",
    kb,
  ].filter(Boolean).join("\n");

  const out = await llmCascade({ system, messages: [{ role: "user", content: user }], jsonMode: true, maxTokens: 900, temperature: 0.6, stage: "music:musicologist" });
  const j = parseJson<Partial<MusicBrief>>(out.text, {});
  return {
    genre: j.genre || i.genre || "electronic",
    subgenre: j.subgenre || i.subgenre,
    region: j.region || "Global",
    era: j.era || "contemporary",
    bpm: num(j.bpm ?? i.tempo, 40, 220, 120),
    timeSignature: j.timeSignature || "4/4",
    key: j.key,
    instruments: Array.isArray(j.instruments) && j.instruments.length ? j.instruments : (i.instruments ? i.instruments.split(/,\s*/) : []),
    structure: j.structure || i.structure || "Intro - build - main - break - main - outro",
    moods: Array.isArray(j.moods) && j.moods.length ? j.moods : (i.mood ? [i.mood] : ["energetic"]),
    energy: num(j.energy ?? i.energy, 1, 10, 6),
    vocalStyle: j.vocalStyle || (i.vocals === false ? "instrumental" : (i.vocalStyle || "instrumental")),
    referenceArtists: Array.isArray(j.referenceArtists) ? j.referenceArtists.slice(0, 5) : [],
    culturalContext: j.culturalContext || "",
    productionNotes: j.productionNotes || "",
  };
}

// ── Agent 2: Beat-smith ──────────────────────────────────────────────────────
// Designs the arrangement/beats and the text-to-music model prompt from the brief.
export async function beatSmith(i: MusicInput, brief: MusicBrief): Promise<BeatSpec> {
  const system = [
    "You are an elite music producer and beat-maker. From a musical brief, design the arrangement and write the PROMPT for a text-to-music model (MusicGen / Stable Audio / ACE-Step).",
    "The model prompt must be a single vivid paragraph (max ~60 words) describing genre, BPM, groove, key instruments, and sound design — concrete and production-specific, no fluff.",
    "Output ONLY JSON with keys: modelPrompt (string), styleTags (string; comma-separated descriptors), negativePrompt (string; what to avoid), tempo (number BPM), arrangement (string; brief section-by-section beat/production plan).",
  ].join("\n");
  const user = [
    `Genre: ${brief.genre}${brief.subgenre ? ` / ${brief.subgenre}` : ""} (${brief.region}, ${brief.era})`,
    `BPM: ${brief.bpm}, time ${brief.timeSignature}${brief.key ? `, key ${brief.key}` : ""}, energy ${brief.energy}/10`,
    `Instruments: ${brief.instruments.join(", ")}`,
    `Moods: ${brief.moods.join(", ")}`,
    `Structure: ${brief.structure}`,
    `Vocals: ${brief.vocalStyle}`,
    brief.productionNotes ? `Production notes: ${brief.productionNotes}` : "",
    brief.referenceArtists.length ? `Reference feel (do NOT copy): ${brief.referenceArtists.join(", ")}` : "",
    i.description ? `Original request: ${i.description}` : "",
  ].filter(Boolean).join("\n");

  const out = await llmCascade({ system, messages: [{ role: "user", content: user }], jsonMode: true, maxTokens: 700, temperature: 0.7, stage: "music:beatsmith" });
  const j = parseJson<Partial<BeatSpec>>(out.text, {});
  const tags = j.styleTags || [brief.genre, brief.subgenre, `${brief.bpm} BPM`, ...brief.moods, brief.instruments.join(" ")].filter(Boolean).join(", ");
  return {
    modelPrompt: (j.modelPrompt || `${brief.genre} at ${brief.bpm} BPM, ${brief.moods.join(" ")}, ${brief.instruments.join(", ")}`).slice(0, 600),
    styleTags: tags,
    negativePrompt: j.negativePrompt,
    tempo: num(j.tempo ?? brief.bpm, 40, 220, brief.bpm),
    arrangement: j.arrangement || brief.structure,
  };
}

// ── Agent 3: Lyricist ────────────────────────────────────────────────────────
// Writes singable lyrics that fit the brief's structure, mood and language.
export async function lyricist(i: MusicInput, brief: MusicBrief): Promise<string> {
  const lang = i.vocalLanguage || "English";
  const structure = i.structure || brief.structure || "Verse - Chorus - Verse - Chorus - Bridge - Chorus";
  const system = [
    "You are a professional songwriter/topliner writing for Suno, Udio and ACE-Step.",
    "Write original, emotionally resonant, SINGABLE lyrics — concrete imagery, a memorable hook, natural rhyme and consistent meter that fits the groove.",
    "Rules:",
    "• Use lowercase section tags on their own line: [intro], [verse], [pre-chorus], [chorus], [bridge], [outro].",
    "• The [chorus] repeats the same lyric each time (it's the hook).",
    "• 4–6 lines per section; keep lines short and rhythmic.",
    `• Language: ${lang}. Match the genre's vocal tradition and the requested mood.`,
    "• Output ONLY the lyrics with tags — no title, no explanation, no markdown, no quotes.",
  ].join("\n");
  const user = [
    `Title: ${i.title || "(untitled)"}`,
    `Theme / brief: ${i.description || brief.culturalContext}`,
    `Genre & feel: ${brief.genre}${brief.subgenre ? ` / ${brief.subgenre}` : ""}, moods ${brief.moods.join(", ")}, ${brief.bpm} BPM`,
    `Vocal style: ${brief.vocalStyle}`,
    i.artistInspiration ? `Vibe reference (do NOT copy any existing lyrics): ${i.artistInspiration}` : "",
    `Structure to follow: ${structure}`,
  ].filter(Boolean).join("\n");

  const out = await llmCascade({ system, messages: [{ role: "user", content: user }], maxTokens: 900, temperature: 0.9, stage: "music:lyricist" });
  return cleanLyrics(out.text);
}

// ── Agent 4: Conductor (synchroniser) ────────────────────────────────────────
// Synchronises brief + beats + lyrics into one coherent set of generation
// inputs, resolving conflicts (e.g. lyric length vs structure, vocal style vs
// genre). Deterministic assembly with an optional LLM coherence pass folded in.
export function conductor(
  i: MusicInput,
  brief: MusicBrief,
  beats: BeatSpec,
  lyrics: string,
): FinalPlan {
  const sing = !!lyrics.trim();
  // Tags line for vocal models (ACE-Step) — style + explicit vocal/instrumental.
  const tags = [
    beats.styleTags,
    sing ? `${brief.vocalStyle} ${i.vocalLanguage || "English"} vocals` : "instrumental, no vocals",
  ].filter(Boolean).join(", ").slice(0, 600);
  // The instrumental/model prompt is the beat-smith's prompt (already vocals-agnostic).
  const prompt = beats.modelPrompt.slice(0, 600);
  return {
    prompt,
    tags,
    lyrics: sing ? lyrics : "",
    durationHint: i.duration,
    coherenceNotes: `${brief.genre} @ ${beats.tempo} BPM · ${brief.moods.join("/")} · ${sing ? "vocal" : "instrumental"}`,
  };
}

// ── Deterministic fallbacks ──────────────────────────────────────────────────
// Used when an agent's LLM call fails (all providers down) so a single failure
// never collapses the whole pipeline. Grounded in the knowledge base so they're
// still genre-appropriate.

export function fallbackBrief(i: MusicInput): MusicBrief {
  const kb = lookupGenres(i)[0];
  return {
    genre: i.genre || kb?.name || "electronic",
    subgenre: i.subgenre,
    region: kb?.region || "Global",
    era: kb?.era || "contemporary",
    bpm: num(i.tempo, 40, 220, kb ? Math.round((kb.bpm[0] + kb.bpm[1]) / 2) : 120),
    timeSignature: "4/4",
    instruments: i.instruments ? i.instruments.split(/,\s*/) : (kb?.instruments ?? []),
    structure: i.structure || kb?.structure || "Intro - verse - chorus - verse - chorus - outro",
    moods: i.mood ? [i.mood] : (kb?.moods ?? ["energetic"]),
    energy: num(i.energy, 1, 10, 6),
    vocalStyle: i.vocals === false ? "instrumental" : (i.vocalStyle || kb?.vocalStyle || "expressive"),
    referenceArtists: kb?.artists ?? [],
    culturalContext: kb ? `${kb.name} — ${kb.region}, ${kb.era}.` : "",
    productionNotes: kb?.production ?? "",
  };
}

export function fallbackBeats(i: MusicInput, brief: MusicBrief): BeatSpec {
  const tags = [brief.genre, brief.subgenre, `${brief.bpm} BPM`, ...brief.moods, brief.instruments.join(" ")].filter(Boolean).join(", ");
  return {
    modelPrompt: `${i.description || brief.genre}. ${brief.genre} at ${brief.bpm} BPM, ${brief.moods.join(" ")}, ${brief.instruments.join(", ")}`.slice(0, 600),
    styleTags: tags,
    tempo: brief.bpm,
    arrangement: brief.structure,
  };
}

// A minimal-but-real singable lyric, so vocal tracks always have something to
// sing even if the Lyricist agent is unavailable ("be it very less, but there").
export function fallbackLyrics(i: MusicInput, brief?: MusicBrief): string {
  const firstSentence = (i.description || "").trim().split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean)[0];
  const hook = (i.title || firstSentence || brief?.genre || "tonight").trim().slice(0, 48);
  const mood = (i.mood || brief?.moods?.[0] || "").toString().toLowerCase();
  const line1 = firstSentence ? firstSentence.slice(0, 64) : (mood ? `we light it up with a ${mood} glow` : "we light it up tonight");
  const line2 = mood ? `feel the ${mood} take control` : "feel the rhythm in my soul";
  return ["[verse]", line1, line2, "[chorus]", hook, hook, "[outro]", hook].join("\n");
}

// ── Lyrics normaliser (shared) ───────────────────────────────────────────────
// ace-step / Suno / Udio expect lowercase section tags on their own line.
export function cleanLyrics(raw: string): string {
  let t = (raw || "").trim();
  t = t.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  const firstTag = t.search(/\[(intro|verse|pre-?chorus|chorus|bridge|hook|outro|refrain)/i);
  if (firstTag > 0 && /here (are|is)|sure|certainly|below/i.test(t.slice(0, firstTag))) t = t.slice(firstTag);
  return t
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.length > 1 && trimmed.length <= 40 && trimmed[0] === "[" && trimmed.endsWith("]")) {
        let inner = trimmed.slice(1, -1).trim().toLowerCase();
        const parts = inner.split(/\s+/);
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
