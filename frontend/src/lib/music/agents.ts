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
import { sectionsOf } from "./structures";
import { BPM_MAX, BPM_MIN, type MusicInput, type MusicBrief, type BeatSpec, type FinalPlan } from "./types";

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
    "Honour the user's explicit choices (genre, tempo, instruments, mood) but enrich them with accurate, genre-idiomatic detail. A tempo hint is the user's chosen BPM: use it exactly, even far outside the genre's usual range. Blend genres faithfully when several are named (e.g. 'hard techno + psy acid' = fast distorted kicks + rolling acid basslines).",
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
    i.vocals !== false && i.vocalIntensity != null ? `Vocal intensity: ${i.vocalIntensity}/10 (1 = soft whisper, 10 = powerful performance)` : "",
    i.vocals !== false && i.vocalEffects ? `Vocal effects: ${i.vocalEffects}` : "",
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
    // The form's tempo and energy are the user's decisions, not hints to overrule.
    bpm: num(i.tempo ?? j.bpm, BPM_MIN, BPM_MAX, 120),
    timeSignature: j.timeSignature || "4/4",
    key: j.key,
    instruments: Array.isArray(j.instruments) && j.instruments.length ? j.instruments : (i.instruments ? i.instruments.split(/,\s*/) : []),
    structure: j.structure || i.structure || "Intro - build - main - break - main - outro",
    moods: Array.isArray(j.moods) && j.moods.length ? j.moods : (i.mood ? [i.mood] : ["energetic"]),
    energy: num(i.energy ?? j.energy, 1, 10, 6),
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
    "The model prompt must be a single vivid paragraph (max ~60 words) that opens with the exact BPM, then genre, groove, key instruments and sound design — concrete and production-specific, no fluff.",
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
    i.description ? `The track must be this, in the user's words: ${songSubject(i.description)}` : "",
    i.description && songSubject(i.description) !== i.description.trim() ? `Full request: ${i.description}` : "",
  ].filter(Boolean).join("\n");

  const out = await llmCascade({ system, messages: [{ role: "user", content: user }], jsonMode: true, maxTokens: 700, temperature: 0.7, stage: "music:beatsmith" });
  const j = parseJson<Partial<BeatSpec>>(out.text, {});
  const tags = j.styleTags || [brief.genre, brief.subgenre, `${brief.bpm} BPM`, ...brief.moods, brief.instruments.join(" ")].filter(Boolean).join(", ");
  const modelPrompt = j.modelPrompt || `${brief.genre}, ${brief.moods.join(" ")}, ${brief.instruments.join(", ")}`;
  return {
    modelPrompt: (modelPrompt.includes(String(brief.bpm)) ? modelPrompt : `${brief.bpm} BPM. ${modelPrompt}`).slice(0, 600),
    styleTags: tags,
    negativePrompt: j.negativePrompt,
    tempo: brief.bpm,
    arrangement: j.arrangement || brief.structure,
  };
}

// ── Agent 3: Lyricist ────────────────────────────────────────────────────────
// Writes lyrics that follow the chosen structure section by section, at the
// vocal density the genre actually has: a psytrance drop is not a pop verse.

const VOCAL_LIGHT = /psy|goa|trance|techno|acid|rave|house|edm|dnb|drum|dubstep|hardcore|hardstyle|gabber|core|ambient|electro|dance/i;

// "create hard techno and acid" is an instruction, not the lyric. What remains
// after the command is the subject the song has to be about.
export function songSubject(description: string): string {
  const raw = description.trim();
  const stripped = raw.replace(
    /^(?:please\s+)?(?:can you\s+)?(?:create|make|generate|write|compose|produce|give me)\s+(?:me\s+)?(?:a\s+|an\s+|some\s+)?(?:(?:song|track|music|tune|beat)\s+)?(?:(?:about|of|for|called|named|that(?:\s+says)?|with|titled)\s+)?/i,
    "",
  ).trim();
  return stripped || raw;
}

export async function lyricist(i: MusicInput, brief: MusicBrief): Promise<string> {
  const langs = (i.vocalLanguage || "English").split(",").map((l) => l.trim()).filter(Boolean);
  const structure = i.structure || brief.structure || "Verse–Chorus–Verse–Chorus–Bridge–Chorus";
  const sections = sectionsOf(structure);
  const light = VOCAL_LIGHT.test(`${brief.genre} ${brief.subgenre ?? ""} ${i.genre ?? ""}`);
  const system = [
    "You are a professional topliner writing lyrics to be sung by an AI singing model (ACE-Step / Suno).",
    "Write ORIGINAL lyrics with concrete imagery, a memorable hook and a consistent meter that sits on the groove. Never reuse existing song lyrics.",
    "The request is a production brief, not a lyric. Do not quote it, repeat it, or use any phrase from it as a sung line. Write new words that fit the genre, mood and language. If the brief names a situation, write about that situation in your own words.",
    sections.length
      ? `Use EXACTLY these section tags, in this order, each on its own line in lowercase square brackets: ${sections.map((x) => `[${x}]`).join(" ")}. Do not add, rename or skip sections.`
      : "Use lowercase section tags on their own line: [intro], [verse], [pre-chorus], [chorus], [bridge], [outro].",
    light
      ? "This is club music, so vocals are sparse: mantras, chants, vocal shots and short hooks of 2–6 words per line, at most 4 lines in any section. Purely instrumental sections (builds, drops, grooves, DJ intro/outro) get only their tag line, or a single short vocal shot where the genre uses one. Repetition is a feature: the hook returns word-for-word."
      : "Verses carry the story in 4–8 lines; the chorus is the hook and repeats word-for-word each time; keep lines short and rhythmic.",
    langs.length > 1
      ? `Languages: ${langs.join(", ")}. Give each language a deliberate role (for example the mantra or hook in one, the verses in another) — never translate the same line into every language. Each line is entirely in one language.`
      : `Language: ${langs[0]}.`,
    "Write Sanskrit, Hindi and other Indic languages in simple romanized transliteration (e.g. \"om namah shivaya\"), which the singing model pronounces far more reliably than Devanagari.",
    "Finish every section you open. Output ONLY the tagged lyrics — no title, notes, markdown or quotes.",
  ].join("\n");
  const user = [
    `Title: ${i.title || "(untitled)"} — a title may be the hook only when it is not the request itself.`,
    i.description ? `Production brief (never sing these words): ${i.description}` : `Feel: ${brief.culturalContext}`,
    `Genre & feel: ${brief.genre}${brief.subgenre ? ` / ${brief.subgenre}` : ""}, moods ${brief.moods.join(", ")}, ${brief.bpm} BPM, energy ${brief.energy}/10`,
    `Vocal style: ${brief.vocalStyle}`,
    i.vocalIntensity != null ? `Vocal intensity: ${i.vocalIntensity}/10 — sparser, softer lines toward 1 (whispered/intimate), bigger declamatory lines toward 10 (belted/anthemic).` : "",
    i.vocalEffects ? `Vocal effects the production will add: ${i.vocalEffects} — write lines that suit them (e.g. short phrases for heavy delay).` : "",
    i.artistInspiration ? `Vibe reference (feel only, never their words): ${i.artistInspiration}` : "",
    `Structure: ${structure}`,
  ].filter(Boolean).join("\n");

  const out = await llmCascade({ system, messages: [{ role: "user", content: user }], maxTokens: 1600, temperature: 0.85, stage: "music:lyricist" });
  return completeLyrics(cleanLyrics(out.text));
}

// A reply cut off mid-line ends in a half-written tag or line; drop the
// fragment rather than send the singer "[" or half a word.
export function completeLyrics(lyrics: string): string {
  const lines = lyrics.split("\n");
  while (lines.length && /^\[[^\]]*$/.test(lines[lines.length - 1].trim())) lines.pop();
  return lines.join("\n").trim();
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
  // Intensity and effects are appended directly (not just folded into the
  // Musicologist's brief) so they reach the model even when the LLM stages are
  // unavailable and fall back to fallbackBrief/fallbackBeats.
  const intensityWord = i.vocalIntensity != null
    ? i.vocalIntensity <= 3 ? "soft, intimate delivery"
    : i.vocalIntensity >= 8 ? "powerful, belted performance"
    : "" // mid-range is already what brief.vocalStyle describes
    : "";
  const vocalTag = [
    brief.vocalStyle, i.vocalLanguage || "English", "vocals",
    intensityWord,
    i.vocalEffects || "",
  ].filter(Boolean).join(", ");
  // ACE-Step reads short comma tags and weighs early ones most, so the tempo
  // and genre lead — "200 BPM" buried behind ten descriptors got ignored and
  // came back at ~144.
  const lead = [`${beats.tempo} bpm`, tempoFeel(beats.tempo), brief.genre, brief.subgenre, brief.key].filter(Boolean) as string[];
  const seen = new Set<string>();
  const tags = [...lead, ...beats.styleTags.split(","), ...(sing ? [vocalTag] : ["instrumental, no vocals"])]
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .join(", ")
    .slice(0, 600);
  // The instrumental/model prompt is the beat-smith's prompt (already vocals-agnostic).
  // If that rewrite dropped what the user actually asked for, put it back in front.
  const subject = songSubject(i.description || "");
  const modelPrompt = beats.modelPrompt.slice(0, 600);
  const prompt = subject && !modelPrompt.toLowerCase().includes(subject.toLowerCase().slice(0, Math.min(24, subject.length)))
    ? `${subject}. ${modelPrompt}`.slice(0, 600)
    : modelPrompt;
  return {
    prompt,
    tags,
    lyrics: sing ? lyrics : "",
    durationHint: i.duration,
    coherenceNotes: `${brief.genre} @ ${beats.tempo} BPM · ${brief.moods.join("/")} · ${sing ? "vocal" : "instrumental"}`,
  };
}

export function tempoFeel(bpm: number): string {
  if (bpm < 90) return "slow tempo";
  if (bpm < 120) return "mid-tempo";
  if (bpm < 150) return "uptempo";
  if (bpm < 190) return "fast tempo";
  if (bpm < 260) return "very fast tempo, relentless double-time";
  return "extreme speed, blurred machine-gun kicks";
}

/**
 * The whole pipeline: Musicologist → Beat-smith + Lyricist in parallel →
 * Conductor. Each agent falls back independently, so one provider outage never
 * collapses it, and a vocal track always has something to sing.
 */
export async function planSong(i: MusicInput): Promise<{ brief: MusicBrief; plan: FinalPlan; sing: boolean }> {
  const vocals = i.vocals !== false && i.lyricsMode !== "none";
  const brief = await musicologist(i).catch(() => fallbackBrief(i));
  const manual = vocals && i.lyricsMode === "manual" ? cleanLyrics(i.lyricsText ?? "") : "";
  const [beats, autoLyrics] = await Promise.all([
    beatSmith(i, brief).catch(() => fallbackBeats(i, brief)),
    vocals && i.lyricsMode !== "manual" ? lyricist(i, brief).catch(() => "") : Promise.resolve(""),
  ]);
  let lyrics = manual || stripPromptLines(autoLyrics.trim(), i.description || "");
  if (vocals && !manual && !sungLines(lyrics)) lyrics = fallbackLyrics(i, brief);
  const plan = conductor(i, brief, beats, lyrics);
  return { brief, plan, sing: vocals && plan.lyrics.trim().length > 0 };
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
    bpm: num(i.tempo, BPM_MIN, BPM_MAX, kb ? Math.round((kb.bpm[0] + kb.bpm[1]) / 2) : 120),
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
function sungLines(lyrics: string): boolean {
  return lyrics.split("\n").some((l) => l.trim() && !l.trim().startsWith("["));
}

// A line that is the request, or that contains a long stretch of it, is the
// prompt being sung. Short topics ("the rain") can still appear in new lines.
export function stripPromptLines(lyrics: string, description: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  const raw = norm(description);
  const subject = norm(songSubject(description));
  const exact = [raw, subject].filter(Boolean);
  const contained = exact.filter((s) => s.length >= 12);
  return lyrics.split("\n").filter((line) => {
    const n = norm(line);
    if (!n || line.trim().startsWith("[")) return true;
    if (exact.some((b) => n === b)) return false;
    return !contained.some((b) => n.includes(b));
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function lyricHook(i: MusicInput, brief?: MusicBrief): string {
  const title = (i.title || "").trim();
  const desc = (i.description || "").trim().toLowerCase();
  const subject = songSubject(i.description || "").toLowerCase();
  const t = title.toLowerCase();
  if (title && t !== subject && t !== desc && !desc.includes(t) && !subject.includes(t)) return title.slice(0, 48);
  const mood = (i.mood || brief?.moods?.[0] || "").toString().toLowerCase();
  if (/dark|sad|melanch|lonely/.test(mood)) return "deeper now";
  if (/happy|uplift|joy|bright|hope/.test(mood)) return "lights up";
  if (/angry|aggressive|rage|fierce/.test(mood)) return "break it open";
  return "feel the night";
}

export function fallbackLyrics(i: MusicInput, brief?: MusicBrief): string {
  const hook = lyricHook(i, brief);
  const light = VOCAL_LIGHT.test(`${brief?.genre ?? ""} ${brief?.subgenre ?? ""} ${i.genre ?? ""} ${i.description ?? ""}`);
  if (light) return ["[intro]", "[drop]", hook, "[chorus]", hook, hook, "[outro]", hook].join("\n");
  return ["[verse]", "Hold on, the night is moving", hook, "[chorus]", hook, hook, "[outro]", hook].join("\n");
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
        if (inner && /^[a-z][a-z' -]{0,23}$/.test(inner)) return `[${inner}]`;
      }
      return line.trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
