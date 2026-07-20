// Shared types for the multi-agent music pipeline.
//
// The pipeline is four cooperating "agents" (each a cascaded LLM call with a
// specialised role), grounded in a universal music knowledge base:
//   1. Musicologist — understands music worldwide/through history; turns the
//      raw request into a grounded MusicBrief (genre lineage, BPM, instruments,
//      structure, cultural context).
//   2. Beat-smith  — designs the arrangement/beats and the text-to-music model
//      prompt from the brief (BeatSpec).
//   3. Lyricist    — writes lyrics that fit the brief's structure & mood.
//   4. Conductor   — synchronises everything into one coherent FinalPlan
//      (prompt + tags + lyrics + duration), resolving any conflicts.

export interface MusicInput {
  title?: string; description?: string; genre?: string; subgenre?: string; mood?: string;
  tempo?: number; duration?: number; vocals?: boolean; vocalStyle?: string; vocalLanguage?: string;
  lyricsMode?: "auto" | "manual" | "none"; lyricsText?: string; artistInspiration?: string;
  instruments?: string; energy?: number; structure?: string;
}

/** A single genre's conventions in the knowledge base. */
export interface GenreProfile {
  name: string;
  aka?: string[];
  region: string;   // where it comes from — "Global", "West Africa", "India", "Detroit/Berlin"…
  era: string;      // when it emerged / peaked — "late 1980s–present"
  bpm: [number, number];
  instruments: string[];
  structure: string;
  moods: string[];
  vocalStyle: string; // typical vocal approach, or "instrumental"
  artists: string[];  // reference artists (for *style* grounding, never copying)
  production: string; // production/sound-design notes
}

/** Musicologist output — the grounded brief the rest of the pipeline builds on. */
export interface MusicBrief {
  genre: string;
  subgenre?: string;
  region: string;
  era: string;
  bpm: number;
  timeSignature?: string;
  key?: string;
  instruments: string[];
  structure: string;
  moods: string[];
  energy: number;          // 1–10
  vocalStyle: string;      // "instrumental" if none
  referenceArtists: string[];
  culturalContext: string; // 1–2 sentences on origins/feel — the "universal knowledge"
  productionNotes: string;
}

/** Beat-smith output — the arrangement + the model prompt. */
export interface BeatSpec {
  modelPrompt: string;   // the text-to-music prompt
  styleTags: string;     // comma-separated style descriptors
  negativePrompt?: string;
  tempo: number;
  arrangement: string;   // section-by-section beat/production plan
}

/** Conductor output — the final, synchronised generation inputs. */
export interface FinalPlan {
  prompt: string;
  tags: string;
  lyrics: string;        // "" when instrumental
  durationHint?: number;
  coherenceNotes?: string;
}
