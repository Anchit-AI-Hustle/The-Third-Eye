"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Music, Play, Download, Sparkles, AlertTriangle, Copy, Check, Wand2, Zap, RefreshCw, WandSparkles, Library, Film, Trash2, Plus, X } from "lucide-react";
import { dataInsert, dataList, dataDelete } from "@/lib/dataClient";
import { generateVisualizerVideo } from "@/lib/musicVideo";
import { recordGeneration } from "@/lib/generations";

interface SavedTrack {
  id: string; title?: string; description?: string; prompt?: string; lyrics?: string;
  audio_url?: string; created_at?: string; params?: Record<string, unknown>;
}
const proxied = (url: string) => `/api/tools/music/proxy?url=${encodeURIComponent(url)}`;

// Broad, real-world option lists rather than a handful of defaults — every
// field below is a starting point the user picks from, but TagPicker/ChipInput
// both still accept anything typed that isn't on the list, so nothing is ever
// actually restricted to these.
const GENRES = [
  "Pop", "Rock", "Hip-hop", "R&B", "Soul", "Funk", "Jazz", "Blues", "Classical", "Opera",
  "Country", "Folk", "Bluegrass", "Americana", "Singer-songwriter", "Indie", "Alternative",
  "Metal", "Punk", "Hardcore", "Emo", "Post-rock", "Shoegaze", "Grunge",
  "EDM", "House", "Deep house", "Tech house", "Techno", "Hardtechno", "Trance", "Psytrance",
  "Dubstep", "Drum & bass", "Jungle", "Garage/UK garage", "Grime", "Hardstyle", "Hyperpop",
  "Trap", "Drill", "Boom bap", "Lo-fi", "Ambient", "Downtempo", "Chillout", "New age", "Vaporwave",
  "Synthwave", "Cinematic", "Orchestral", "Video game/chiptune", "Industrial", "Experimental",
  "Afrobeats", "Afrobeat", "Highlife", "Soukous", "Amapiano", "Reggae", "Dub", "Dancehall", "Soca",
  "Latin", "Reggaeton", "Salsa", "Cumbia", "Bachata", "Bossa nova", "Samba", "Tango", "Flamenco",
  "K-pop", "J-pop", "City pop", "Enka", "Bollywood", "Bhangra", "Qawwali", "Carnatic", "Hindustani classical",
  "Gamelan", "Klezmer", "Celtic", "Fado", "Rai", "Gospel", "Christian/worship", "World", "Ska",
  "Musical theatre", "Disco", "Swing", "Bebop",
];
const MOODS = [
  "Uplifting", "Chill", "Energetic", "Melancholic", "Dreamy", "Epic", "Romantic", "Playful",
  "Dark", "Nostalgic", "Aggressive", "Peaceful", "Mysterious", "Triumphant", "Hopeful",
  "Anxious/tense", "Euphoric", "Sorrowful", "Sensual", "Whimsical", "Menacing", "Serene",
  "Rebellious", "Bittersweet", "Majestic", "Intimate", "Haunting", "Groovy", "Ethereal",
  "Gritty", "Tender", "Ominous", "Jubilant", "Wistful", "Fierce", "Cozy", "Carefree",
  "Yearning", "Defiant", "Confident",
];
const VOCAL_STYLES = [
  "Smooth", "Powerful", "Soft/whispery", "Breathy", "Rap/spoken", "Spoken word", "Choir",
  "Raspy", "Gritty/rock", "Falsetto", "Belting", "Operatic", "Growl/scream", "Auto-tuned",
  "Gospel/soulful", "Nasal", "Robotic/vocoder", "Yodel", "Throat singing", "Beatbox",
  "Harmonized/multi-part", "Call-and-response", "Melodic rap", "Vibrato-heavy", "Deadpan/monotone",
];
const LANGUAGES = [
  "English", "Hindi", "Punjabi", "Bengali", "Urdu", "Tamil", "Telugu", "Marathi", "Gujarati",
  "Spanish", "Portuguese", "French", "German", "Italian", "Dutch", "Swedish", "Polish",
  "Russian", "Ukrainian", "Greek", "Turkish", "Romanian", "Hungarian", "Czech",
  "Korean", "Japanese", "Mandarin Chinese", "Cantonese", "Vietnamese", "Thai", "Indonesian", "Tagalog/Filipino",
  "Arabic", "Hebrew", "Persian/Farsi", "Swahili", "Yoruba", "Zulu", "Amharic", "Wolof",
  "Instrumental / no lyrics",
];
const VOCAL_EFFECTS = [
  "Reverb", "Autotune", "Delay/echo", "Distortion", "Harmonizer", "Choir layer", "Whisper layer",
  "Vocoder", "Chorus/doubling", "Telephone filter", "Pitch shift", "Formant shift", "Flanger",
  "Phaser", "Bitcrush/lo-fi", "Radio filter", "Megaphone", "Underwater/muffled", "Stutter/glitch",
  "Wide stereo double", "Gated reverb", "Tape saturation", "Layered ad-libs",
];
const STRUCTURES = [
  "Verse–Chorus–Verse–Chorus–Bridge–Chorus",
  "Intro–Verse–Chorus–Verse–Chorus–Bridge–Chorus–Outro",
  "Intro–Verse–Pre-chorus–Chorus–Verse–Pre-chorus–Chorus–Bridge–Chorus–Outro",
  "Intro–Build–Drop–Breakdown–Drop–Outro",
  "Intro–Theme–Solo–Theme–Outro",
  "AABA",
  "12-bar blues",
  "Through-composed (no repeats)",
  "Call-and-response loop",
  "Rondo (ABACA)",
  "Theme and variations",
];
const INSTRUMENTS = [
  "Acoustic guitar", "Electric guitar", "Bass guitar", "Upright bass", "Synth bass", "808 bass",
  "Drum kit", "808/trap drums", "909 drum machine", "Hand percussion", "Cajon", "Tabla",
  "Piano", "Electric piano/Rhodes", "Organ", "Synth lead", "Synth pad", "Analog synth", "Vocoder",
  "Violin", "Viola", "Cello", "Double bass (orchestral)", "Strings section", "Harp",
  "Trumpet", "Trombone", "Saxophone", "Clarinet", "Flute", "French horn", "Brass section",
  "Sitar", "Tanpura", "Bansuri", "Erhu", "Koto", "Shamisen", "Oud", "Duduk", "Kalimba",
  "Steel drums/pan", "Marimba", "Vibraphone", "Timpani", "Choir", "Handclaps", "Vinyl crackle",
  "Field recordings", "TB-303 acid bass", "Sub bass", "Pads/atmosphere",
];
const ARTIST_INSPIRATION = [
  "The Beatles", "Fleetwood Mac", "Daft Punk", "Radiohead", "Kendrick Lamar", "Beyoncé",
  "Taylor Swift", "The Weeknd", "Billie Eilish", "Dua Lipa", "Drake", "Travis Scott",
  "Charlotte de Witte", "Amelie Lens", "Fisher", "John Summit", "Martin Garrix", "Skrillex",
  "Bon Iver", "José González", "Nujabes", "J Dilla", "Robert Glasper", "Miles Davis",
  "Hans Zimmer", "Ludwig Göransson", "Brian Eno", "Jon Hopkins", "ODESZA", "Flume",
  "Metallica", "Gojira", "Foo Fighters", "Arctic Monkeys", "Tame Impala", "Fela Kuti",
  "Burna Boy", "Bad Bunny", "Rosalía", "BTS", "A.R. Rahman", "Nusrat Fateh Ali Khan",
];

type Phase = "idle" | "generating" | "queued" | "ready" | "error";
type Fields = {
  title: string; description: string; genres: string[]; subgenre: string; moods: string[];
  tempo: number; duration: number; vocals: boolean; vocalStyles: string[]; vocalLanguages: string[];
  vocalIntensity: number; vocalEffects: string[];
  lyricsMode: "auto" | "manual" | "none"; lyricsText: string; artistInspiration: string[];
  instruments: string[]; energy: number; structure: string; makeVideoUpfront: boolean;
};

const MAX_DURATION = 18000;
// Clamp ranges for AI suggestions landing on number fields.
const NUMBER_RANGES: Partial<Record<keyof Fields, [number, number]>> = {
  tempo: [60, 200], energy: [1, 10], vocalIntensity: [1, 10], duration: [10, MAX_DURATION],
};
// What each field resets to on Clear.
const FIELD_DEFAULTS: Partial<Record<keyof Fields, Fields[keyof Fields]>> = {
  title: "", description: "", genres: [], subgenre: "", moods: [],
  tempo: 120, duration: 30, vocalStyles: [], vocalLanguages: [],
  vocalIntensity: 5, vocalEffects: [], lyricsText: "", artistInspiration: [],
  instruments: [], energy: 6, structure: "",
};

// What the Musicologist agent understood — surfaced back to the user.
interface Brief {
  genre?: string; subgenre?: string; region?: string; era?: string; bpm?: number;
  moods?: string[]; energy?: number; instruments?: string[]; vocalStyle?: string;
  referenceArtists?: string[]; culturalContext?: string;
}
const field = "w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[#34D399] transition-colors";
const lbl = "flex items-center text-xs font-mono text-text-secondary mb-1.5";

// Human-friendly duration label (e.g. 30s, 3m, 1h 30m, 5h).
function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return r ? `${m}m ${r}s` : `${m}m`; }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Match a free-text AI value to the closest option in a fixed list.
function matchOption(val: string, opts: string[]): string | null {
  if (!val) return null;
  const v = val.toLowerCase();
  return opts.find((o) => o.toLowerCase() === v) || opts.find((o) => v.includes(o.toLowerCase()) || o.toLowerCase().includes(v)) || null;
}

// Search-to-add chip picker — used for Genres, Vocal Effects, Vocal Language(s).
// Typing a value not in `options` and pressing Enter still adds it, so an AI
// suggestion or anything genuinely custom is never rejected.
function TagPicker({ values, onChange, options, placeholder, max = 6 }: {
  values: string[]; onChange: (v: string[]) => void; options: string[]; placeholder: string; max?: number;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = options.filter((o) => !values.includes(o) && o.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  function add(v: string) {
    const t = v.trim();
    if (!t || values.includes(t) || values.length >= max) return;
    onChange([...values, t]);
    setQ(""); setOpen(false);
  }
  function remove(v: string) { onChange(values.filter((x) => x !== v)); }

  return (
    <div>
      <div className="relative">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(q); } }}
          placeholder={values.length >= max ? `Up to ${max} — remove one to add another` : placeholder}
          disabled={values.length >= max}
          className={`${field} disabled:opacity-50`}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-input border border-border-default bg-background-surface shadow-lg">
            {filtered.map((o) => (
              <button key={o} type="button" onMouseDown={() => add(o)}
                className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-[#34D399]/10 hover:text-[#34D399] transition-colors">
                {o}
              </button>
            ))}
          </div>
        )}
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399]">
              {v}
              <button type="button" onClick={() => remove(v)} className="hover:text-accent-red transition-colors" title={`Remove ${v}`}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// An icon button with a fast CSS hover label, rather than the browser's own
// `title` tooltip — used for the per-field AI toolbar, where four
// similar-looking icons in a row need to be told apart at a glance.
function IconBtn({ label, onClick, disabled, danger, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode;
}) {
  return (
    <span className="relative inline-flex group/icon">
      <button type="button" onClick={onClick} disabled={disabled}
        className={`p-1 rounded transition-colors disabled:opacity-40 ${danger ? "text-text-muted hover:text-accent-red" : "text-text-muted hover:text-[#34D399]"}`}>
        {children}
      </button>
      <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded border border-border-default bg-background-base px-1.5 py-0.5 text-[10px] font-mono text-text-secondary opacity-0 shadow-lg transition-opacity group-hover/icon:opacity-100">
        {label}
      </span>
    </span>
  );
}

// Free-text field with quick-pick chips below it — used for Mood and Structure,
// which need to accept a custom/AI value while still offering the fixed list.
function ChipInput({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={field} />
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors ${value === o ? "border-[#34D399] text-[#34D399] bg-[#34D399]/10" : "border-border-default text-text-muted hover:text-text-primary"}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MusicStudio() {
  const [f, setF] = useState<Fields>({
    title: "", description: "", genres: [GENRES[0]], subgenre: "", moods: [MOODS[0]],
    tempo: 120, duration: 30, vocals: true, vocalStyles: [VOCAL_STYLES[0]], vocalLanguages: [LANGUAGES[0]],
    vocalIntensity: 5, vocalEffects: [],
    lyricsMode: "auto", lyricsText: "", artistInspiration: [], instruments: [], energy: 6, structure: STRUCTURES[0],
    makeVideoUpfront: false,
  });
  const set = useCallback(<K extends keyof Fields>(k: K, v: Fields[K]) => setF((p) => ({ ...p, [k]: v })), []);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loopSession, setLoopSession] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filling, setFilling] = useState(false);
  const [busyField, setBusyField] = useState<string | null>(null);
  const prevSug = useRef<Record<string, string[]>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPoll = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);
  useEffect(() => () => stopPoll(), [stopPoll]);

  // Tabs + library + video
  const [tab, setTab] = useState<"create" | "library">("create");
  const [tracks, setTracks] = useState<SavedTrack[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoPct, setVideoPct] = useState(0);
  const [savedNote, setSavedNote] = useState(false);
  const fFor = useRef(f); fFor.current = f;
  const pRef = useRef(""); const lRef = useRef("");

  // Library is localStorage-backed with cloud best-effort, so it works even
  // before the music_tracks table exists, and upgrades to cloud once it does.
  const LS_KEY = "te_music_tracks_v1";
  const lsRead = (): SavedTrack[] => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; } };
  const lsWrite = (v: SavedTrack[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v.slice(0, 200))); } catch { /* noop */ } };

  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const local = lsRead();
      const r = await dataList<SavedTrack>("music_tracks").catch(() => ({ remote: false, rows: [] as SavedTrack[] }));
      const byId = new Map<string, SavedTrack>();
      [...(r.rows ?? []), ...local].forEach((t) => { if (t?.id && !byId.has(t.id)) byId.set(t.id, t); });
      const merged = [...byId.values()].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      setTracks(merged);
    } finally { setLibLoading(false); }
  }, []);
  useEffect(() => { if (tab === "library") loadLibrary(); }, [tab, loadLibrary]);

  async function saveTrack(audio: string, promptStr: string, lyricsStr: string) {
    const cur = fFor.current;
    const row: SavedTrack = {
      id: crypto.randomUUID(),
      title: cur.title || cur.description.slice(0, 60), description: cur.description,
      prompt: promptStr, lyrics: lyricsStr, audio_url: audio, created_at: new Date().toISOString(),
      params: { genres: cur.genres, moods: cur.moods, tempo: cur.tempo, vocals: cur.vocals, duration: cur.duration },
    };
    lsWrite([row, ...lsRead()]);                 // always persist locally
    dataInsert("music_tracks", row).catch(() => {}); // cloud best-effort
    recordGeneration({
      app: "music", appLabel: "Music Studio",
      title: row.title || "Track",
      kind: "audio",
      inputs: [
        { label: "Genres", value: cur.genres.join(", ") }, { label: "Moods", value: cur.moods.join(", ") },
        { label: "Tempo", value: `${cur.tempo} BPM` }, { label: "Structure", value: cur.structure },
        { label: "Instruments", value: cur.instruments.join(", ") }, { label: "Artist vibe", value: cur.artistInspiration.join(", ") },
        { label: "Vocals", value: cur.vocals ? `${cur.vocalStyles.join(", ")} (${cur.vocalIntensity}/10)` : "instrumental" },
        { label: "Vocal languages", value: cur.vocalLanguages.join(", ") },
        { label: "Vocal effects", value: cur.vocalEffects.join(", ") },
      ].filter((x) => x.value),
      inputText: cur.description,
      output: audio, meta: { prompt: promptStr, lyrics: lyricsStr },
    });
    setSavedNote(true); setTimeout(() => setSavedNote(false), 2500);
  }

  async function deleteTrack(id: string) {
    lsWrite(lsRead().filter((x) => x.id !== id));
    await dataDelete("music_tracks", id).catch(() => {});
    setTracks((p) => p.filter((x) => x.id !== id));
  }

  async function makeVideo(audio: string, title: string, target: "create" | string) {
    setVideoBusy(true); setVideoPct(0); setError(null);
    try {
      // data:/blob: URLs are already same-origin — only remote URLs need the proxy.
      const src = /^(data:|blob:)/.test(audio) ? audio : proxied(audio);
      // On the create tab, render the full requested session (the generator caps
      // it and the clip loops seamlessly to fill it); library items loop off.
      const loopToSeconds = target === "create" ? Number(f.duration) || undefined : undefined;
      const blob = await generateVisualizerVideo(src, { title, onProgress: setVideoPct, loopToSeconds });
      const url = URL.createObjectURL(blob);
      if (target === "create") setVideoUrl(url);
      else { const a = document.createElement("a"); a.href = url; a.download = `${title || "track"}.webm`; a.click(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Video generation failed."); }
    finally { setVideoBusy(false); }
  }

  // ── AI auto-fill: infer the whole form from the description ──
  async function autoFill() {
    if (!f.description.trim() || filling) return;
    setFilling(true); setError(null);
    try {
      const res = await fetch("/api/tools/music/infer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: f.description }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Auto-fill failed"); return; }
      const x = d.fields ?? {};
      setF((p) => ({
        ...p,
        title: x.title || p.title,
        genres: x.genre ? [matchOption(x.genre, GENRES) || x.genre] : p.genres,
        subgenre: x.subgenre || p.subgenre,
        moods: x.mood ? [matchOption(x.mood, MOODS) || x.mood] : p.moods,
        tempo: Number(x.tempo) >= 60 && Number(x.tempo) <= 200 ? Math.round(x.tempo) : p.tempo,
        energy: Number(x.energy) >= 1 && Number(x.energy) <= 10 ? Math.round(x.energy) : p.energy,
        duration: Number(x.duration) >= 10 && Number(x.duration) <= 120 ? Math.round(x.duration) : p.duration,
        structure: x.structure || p.structure,
        instruments: x.instruments ? String(x.instruments).split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 8) : p.instruments,
        artistInspiration: x.artistInspiration ? String(x.artistInspiration).split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 4) : p.artistInspiration,
        vocals: typeof x.vocals === "boolean" ? x.vocals : p.vocals,
        vocalStyles: x.vocalStyle ? [matchOption(x.vocalStyle, VOCAL_STYLES) || x.vocalStyle] : p.vocalStyles,
        vocalLanguages: x.vocalLanguage ? [matchOption(x.vocalLanguage, LANGUAGES) || x.vocalLanguage] : p.vocalLanguages,
        vocalIntensity: Number(x.vocalIntensity) >= 1 && Number(x.vocalIntensity) <= 10 ? Math.round(x.vocalIntensity) : p.vocalIntensity,
        vocalEffects: x.vocalEffects ? String(x.vocalEffects).split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 4) : p.vocalEffects,
      }));
    } catch { setError("Auto-fill network error."); }
    finally { setFilling(false); }
  }

  // ── AI per-field: Suggest / Enhance / New ──
  // Generalised over string, number and array fields — the suggest endpoint
  // only knows singular field vocabulary, so the plural array fields (genres,
  // vocalLanguages) reuse their singular instructions and the response is split
  // back into a list.
  function applySuggestion(name: keyof Fields, suggestion: string) {
    const current = f[name];
    if (Array.isArray(current)) {
      const items = suggestion.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
      if (items.length) set(name, items as never);
      return;
    }
    if (typeof current === "number") {
      const m = suggestion.match(/-?\d+(\.\d+)?/);
      if (!m) return;
      const [lo, hi] = NUMBER_RANGES[name] ?? [-Infinity, Infinity];
      set(name, Math.min(hi, Math.max(lo, Math.round(Number(m[0])))) as never);
      return;
    }
    set(name, suggestion as never);
  }

  async function aiField(name: keyof Fields, action: "suggest" | "enhance" | "new") {
    const key = String(name);
    // The suggest endpoint's field vocabulary is singular; the plural state
    // keys reuse those instructions and split the response back into a list.
    const API_FIELD: Partial<Record<keyof Fields, string>> = {
      genres: "genre", moods: "mood", vocalStyles: "vocalStyle", vocalLanguages: "vocalLanguage",
    };
    const apiField = API_FIELD[name] ?? key;
    setBusyField(`${key}:${action}`); setError(null);
    try {
      const current = f[name];
      const valueStr = Array.isArray(current) ? current.join(", ") : String(current ?? "");
      const res = await fetch("/api/tools/music/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: apiField,
          value: valueStr, action,
          previous: prevSug.current[key] ?? [],
          context: {
            genre: f.genres.join(", "), subgenre: f.subgenre, mood: f.moods.join(", "), tempo: f.tempo, energy: f.energy,
            instruments: f.instruments.join(", "), artistInspiration: f.artistInspiration.join(", "),
            vocals: f.vocals, vocalStyle: f.vocalStyles.join(", "), description: f.description,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Suggestion failed"); return; }
      if (d.suggestion) {
        prevSug.current[key] = [...(prevSug.current[key] ?? []), valueStr].filter(Boolean).slice(-6);
        applySuggestion(name, d.suggestion);
      }
    } catch { setError("Suggestion network error."); }
    finally { setBusyField(null); }
  }

  function clearField(name: keyof Fields) {
    if (name in FIELD_DEFAULTS) set(name, FIELD_DEFAULTS[name] as Fields[typeof name]);
  }

  async function generate() {
    stopPoll();
    setPhase("generating"); setError(null); setNote(null); setAudioUrl(null); setVideoUrl(null); setStatus("Writing the track…");
    try {
      const payload = {
        ...f,
        genre: f.genres.join(", "),
        mood: f.moods.join(", "),
        vocalStyle: f.vocalStyles.join(", "),
        vocalLanguage: f.vocalLanguages.join(", "),
        vocalEffects: f.vocalEffects.join(", "),
        instruments: f.instruments.join(", "),
        artistInspiration: f.artistInspiration.join(", "),
      };
      const res = await fetch("/api/tools/music", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) { setPhase("error"); setError(d.error ?? `HTTP ${res.status}`); setPrompt(d.prompt ?? ""); setLyrics(d.lyrics ?? ""); return; }
      setPrompt(d.prompt ?? ""); setLyrics(d.lyrics ?? ""); pRef.current = d.prompt ?? ""; lRef.current = d.lyrics ?? "";
      setBrief(d.brief ?? null);
      setLoopSession(!!d.loop);
      if (d.configured === false) { setPhase("error"); setNote(d.note); return; }
      if (d.fellBackToInstrumental) setNote(`Couldn't generate sung vocals${d.vocalError ? ` — ${String(d.vocalError).slice(0, 160)}` : ""}, so this is an instrumental version (lyrics shown below).`);
      if (d.loop) setNote(`Long session: a ${d.clipSeconds}s clip will loop seamlessly to fill ${fmtDuration(d.sessionSeconds)}.`);
      // Free HuggingFace fallback returns audio synchronously (no job to poll).
      if (d.done && d.audioUrl) { onAudioReady(d.audioUrl); return; }
      setPhase("queued"); setStatus("Composing audio… this can take up to a minute.");
      poll(d.jobId);
    } catch { setPhase("error"); setError("Network error — please try again."); }
  }
  // Audio is ready: play, save, and — if the user asked for a video up-front —
  // kick off the visualizer render automatically (spanning the full session).
  function onAudioReady(url: string) {
    setAudioUrl(url); setPhase("ready"); setStatus("");
    void saveTrack(url, pRef.current, lRef.current);
    if (fFor.current.makeVideoUpfront) {
      void makeVideo(url, fFor.current.title || fFor.current.description, "create");
    }
  }
  function poll(jobId: string) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tools/music?id=${encodeURIComponent(jobId)}`);
        const d = await res.json();
        if (d.status) setStatus(`Composing audio… (${d.status})`);
        if (d.status === "succeeded" && d.audioUrl) { stopPoll(); onAudioReady(d.audioUrl); }
        else if (d.status === "failed" || d.status === "canceled" || d.error) { stopPoll(); setPhase("error"); setError(d.error || "Generation failed."); }
      } catch { /* keep polling */ }
    }, 3000);
  }
  const busy = phase === "generating" || phase === "queued";

  // Per-field AI toolbar: Suggest / Enhance / New / Clear — every field carries
  // all four, whatever its underlying type (text, number, or a tag list).
  // Labelled on hover: a native `title` has a slow, inconsistent delay and gets
  // lost against four identical-looking icons in a row, so each gets its own
  // fast CSS tooltip instead — and a larger tap target, since four icons at
  // size 12 with a 4px gap were hard to aim at on a real screen.
  const AiBar = ({ name }: { name: keyof Fields }) => (
    <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
      {(["suggest", "enhance", "new"] as const).map((a) => {
        const Icon = a === "suggest" ? Wand2 : a === "enhance" ? Zap : RefreshCw;
        const on = busyField === `${String(name)}:${a}`;
        const label = a === "suggest" ? "Suggest" : a === "enhance" ? "Enhance" : "New";
        return (
          <IconBtn key={a} label={label} onClick={() => aiField(name, a)} disabled={!!busyField}>
            {on ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
          </IconBtn>
        );
      })}
      <IconBtn label="Clear" onClick={() => clearField(name)} disabled={!!busyField} danger>
        <Trash2 size={13} />
      </IconBtn>
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {(["create", "library"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-input text-sm font-medium transition-colors ${tab === t ? "bg-[#34D399]/15 text-[#34D399]" : "text-text-muted hover:text-text-secondary"}`}>
            {t === "create" ? <Plus size={14} /> : <Library size={14} />} {t === "create" ? "Create" : "Library"}
          </button>
        ))}
      </div>

      {tab === "library" ? (
        <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="hud-label text-[#34D399]">Your tracks ({tracks.length})</span>
            <button onClick={loadLibrary} className="text-text-muted hover:text-text-primary" title="Refresh"><RefreshCw size={13} /></button>
          </div>
          {libLoading ? (
            <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
          ) : tracks.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">No tracks yet. Create one and it'll appear here.</p>
          ) : (
            <div className="space-y-3">
              {tracks.map((t) => (
                <div key={t.id} className="rounded-input border border-border-default bg-background-base p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music size={13} className="text-[#34D399] flex-none" />
                    <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{t.title || "Untitled"}</span>
                    <span className="text-[10px] text-text-muted font-mono flex-none">{t.created_at ? new Date(t.created_at).toLocaleDateString() : ""}</span>
                    <button onClick={() => deleteTrack(t.id)}
                      className="text-text-muted hover:text-accent-red flex-none" title="Delete"><Trash2 size={13} /></button>
                  </div>
                  {t.audio_url && <audio controls src={t.audio_url} className="w-full h-9" />}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {t.audio_url && <a href={t.audio_url} download className="inline-flex items-center gap-1 px-2 py-1 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary"><Download size={11} /> Audio</a>}
                    {t.audio_url && (
                      <button onClick={() => makeVideo(t.audio_url!, t.title || "track", t.id)} disabled={videoBusy}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-input border border-[#34D399]/40 text-[11px] text-[#34D399] hover:bg-[#34D399]/10 disabled:opacity-40">
                        {videoBusy ? <Loader2 size={11} className="animate-spin" /> : <Film size={11} />} Video
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      /* The form was capped at 400px while the output panel — empty until
         something is generated — ate the rest of the page. Wider form,
         narrower minimum for the output side so the page stops looking
         half-unused before the first generation. */
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(420px,640px)_minmax(320px,1fr)] gap-5">
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5 space-y-3.5 self-start">
        <div>
          <label className={lbl}>Music prompt <span className="text-accent-red">*</span> <AiBar name="description" /></label>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3}
            placeholder="e.g. a driving hardtechno track with pulsing bass for a late-night set" className={`${field} resize-y`} />
          <button onClick={autoFill} disabled={filling || !f.description.trim()}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-input border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] text-xs font-semibold hover:bg-[#34D399]/20 disabled:opacity-40 transition-all">
            {filling ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />} Auto-fill all fields from this
          </button>
        </div>

        <div><label className={lbl}>Track name <AiBar name="title" /></label><input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="optional" className={field} /></div>
        <div>
          <label className={lbl}>Artist inspiration <AiBar name="artistInspiration" /></label>
          <TagPicker values={f.artistInspiration} onChange={(v) => set("artistInspiration", v)} options={ARTIST_INSPIRATION} placeholder="Search artists…" max={4} />
        </div>

        <div>
          <label className={lbl}>Genres <AiBar name="genres" /></label>
          <TagPicker values={f.genres} onChange={(v) => set("genres", v)} options={GENRES} placeholder="Search genres…" max={6} />
        </div>
        <div><label className={lbl}>Sub-genre <AiBar name="subgenre" /></label><input value={f.subgenre} onChange={(e) => set("subgenre", e.target.value)} placeholder="optional" className={field} /></div>

        <div>
          <label className={lbl}>Moods <AiBar name="moods" /></label>
          <TagPicker values={f.moods} onChange={(v) => set("moods", v)} options={MOODS} placeholder="Search moods…" max={5} />
        </div>

        <div>
          <label className={lbl}>Instruments <AiBar name="instruments" /></label>
          <TagPicker values={f.instruments} onChange={(v) => set("instruments", v)} options={INSTRUMENTS} placeholder="Search instruments…" max={10} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Tempo (BPM): {f.tempo} <AiBar name="tempo" /></label><input type="range" min={60} max={200} value={f.tempo} onChange={(e) => set("tempo", Number(e.target.value))} className="w-full accent-[#34D399]" /></div>
          <div><label className={lbl}>Energy: {f.energy}/10 <AiBar name="energy" /></label><input type="range" min={1} max={10} value={f.energy} onChange={(e) => set("energy", Number(e.target.value))} className="w-full accent-[#34D399]" /></div>
        </div>

        <div>
          <label className={lbl}>Song structure <AiBar name="structure" /></label>
          <ChipInput value={f.structure} onChange={(v) => set("structure", v)} options={STRUCTURES} placeholder="e.g. Intro → Verse → Chorus → Outro" />
        </div>

        <div>
          <label className={lbl}>Session length: {fmtDuration(f.duration)} <AiBar name="duration" /></label>
          <input type="range" min={10} max={MAX_DURATION} step={10} value={f.duration} onChange={(e) => set("duration", Number(e.target.value))} className="w-full accent-[#34D399]" />
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {[30, 60, 180, 600, 1800, 3600, 10800, 18000].map((s) => (
              <button key={s} type="button" onClick={() => set("duration", s)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors ${f.duration === s ? "border-[#34D399] text-[#34D399] bg-[#34D399]/10" : "border-border-default text-text-muted hover:text-text-primary"}`}>
                {fmtDuration(s)}
              </button>
            ))}
          </div>
          {f.duration > 120 && (
            <p className="text-[11px] text-text-muted mt-1.5">Long sessions are built by seamlessly looping a generated clip — perfect for focus / ambient / party sets.</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="text-xs font-mono text-text-secondary">Vocals + lyrics</label>
          <button onClick={() => set("vocals", !f.vocals)} className={`relative w-9 h-5 rounded-full transition-colors ${f.vocals ? "bg-[#34D399]" : "bg-border-default"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${f.vocals ? "left-4" : "left-0.5"}`} />
          </button>
        </div>
        {f.vocals && (
          <>
            <div>
              <label className={lbl}>Vocal style(s) <AiBar name="vocalStyles" /></label>
              <TagPicker values={f.vocalStyles} onChange={(v) => set("vocalStyles", v)} options={VOCAL_STYLES} placeholder="Search vocal styles…" max={4} />
            </div>
            <div>
              <label className={lbl}>Vocal language(s) <AiBar name="vocalLanguages" /></label>
              <TagPicker values={f.vocalLanguages} onChange={(v) => set("vocalLanguages", v)} options={LANGUAGES} placeholder="Select languages…" max={5} />
            </div>
            <div>
              <label className={lbl}>Vocal intensity: {f.vocalIntensity}/10 <AiBar name="vocalIntensity" /></label>
              <input type="range" min={1} max={10} value={f.vocalIntensity} onChange={(e) => set("vocalIntensity", Number(e.target.value))} className="w-full accent-[#34D399]" />
              <div className="flex justify-between text-[10px] text-text-muted mt-1">
                <span>1 — Soft whisper</span><span>10 — Powerful performance</span>
              </div>
            </div>
            <div>
              <label className={lbl}>Vocal effects <AiBar name="vocalEffects" /></label>
              <TagPicker values={f.vocalEffects} onChange={(v) => set("vocalEffects", v)} options={VOCAL_EFFECTS} placeholder="Select effects…" max={6} />
            </div>
            <div>
              <label className={lbl}>Lyrics {f.lyricsMode === "manual" && <AiBar name="lyricsText" />}</label>
              <div className="flex gap-1 mb-2">
                {(["auto", "manual", "none"] as const).map((m) => (
                  <button key={m} onClick={() => set("lyricsMode", m)}
                    className={`flex-1 text-[11px] py-1 rounded-input border ${f.lyricsMode === m ? "border-[#34D399] text-[#34D399] bg-[#34D399]/10" : "border-border-default text-text-muted"}`}>
                    {m === "auto" ? "Auto-write" : m === "manual" ? "My lyrics" : "No lyrics"}
                  </button>
                ))}
              </div>
              {f.lyricsMode === "manual" && (
                <textarea value={f.lyricsText} onChange={(e) => set("lyricsText", e.target.value)} rows={4} placeholder="[Verse]\n…\n[Chorus]\n…" className={`${field} resize-y`} />
              )}
            </div>
          </>
        )}

        <div className="flex items-center justify-between pt-1">
          <label className="text-xs font-mono text-text-secondary flex items-center gap-1.5"><Film size={13} className="text-[#34D399]" /> Also create a music video</label>
          <button onClick={() => set("makeVideoUpfront", !f.makeVideoUpfront)} className={`relative w-9 h-5 rounded-full transition-colors ${f.makeVideoUpfront ? "bg-[#34D399]" : "bg-border-default"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${f.makeVideoUpfront ? "left-4" : "left-0.5"}`} />
          </button>
        </div>

        <button onClick={generate} disabled={busy || !f.description.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold text-[#07070F] bg-[#34D399] hover:brightness-110 disabled:opacity-50 transition-all">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {phase === "generating" ? "Writing…" : phase === "queued" ? "Composing…" : "Generate music"}
        </button>
        {note && <p className="text-xs text-[#F0C94E] flex items-start gap-1.5"><AlertTriangle size={12} className="flex-none mt-0.5" />{note}</p>}
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>

      <div className="rounded-card border border-border-default bg-background-surface/40 p-5 min-h-[420px]">
        {phase === "idle" && (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted py-16">
            <Music size={28} className="opacity-40 mb-3 text-[#34D399]" />
            <p className="text-sm">Describe a track, hit “Auto-fill all fields”, tweak, then “Generate music”.</p>
            <p className="text-xs mt-1">You'll get a playable, downloadable audio track — instrumental or with AI vocals.</p>
          </div>
        )}
        {busy && (<div className="h-full flex flex-col items-center justify-center text-center text-text-secondary py-16"><Loader2 size={24} className="animate-spin text-[#34D399] mb-3" /><p className="text-sm">{status}</p></div>)}
        {audioUrl && phase === "ready" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#34D399]"><Play size={16} /><span className="hud-label text-[#34D399]">Your track</span>{savedNote && <span className="text-[10px] text-text-muted">· saved to library</span>}{loopSession && <span className="text-[10px] font-mono text-text-muted">· 🔁 looping to fill {fmtDuration(f.duration)}</span>}</div>
            <audio controls loop={loopSession} src={audioUrl} className="w-full" />
            <div className="flex flex-wrap items-center gap-2">
              <a href={audioUrl} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary"><Download size={12} /> Audio</a>
              <button onClick={() => makeVideo(audioUrl, f.title || f.description, "create")} disabled={videoBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input border border-[#34D399]/40 text-xs text-[#34D399] hover:bg-[#34D399]/10 disabled:opacity-40">
                {videoBusy ? <><Loader2 size={12} className="animate-spin" /> Rendering {Math.round(videoPct * 100)}%</> : <><Film size={12} /> Generate video</>}
              </button>
            </div>
            {videoBusy && !videoUrl && (
              <p className="text-[11px] font-mono text-text-muted flex items-center gap-1.5"><Loader2 size={11} className="animate-spin text-[#34D399]" /> Rendering your music video… {Math.round(videoPct * 100)}%</p>
            )}
            {videoUrl && (
              <div className="space-y-2">
                <video controls src={videoUrl} className="w-full rounded-input bg-black" />
                <a href={videoUrl} download={`${f.title || "track"}.webm`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary"><Download size={12} /> Download video</a>
              </div>
            )}
            {brief && <BriefCard brief={brief} />}
          </div>
        )}
        {(prompt || lyrics) && (
          <div className={`${audioUrl ? "mt-6 pt-5 border-t border-border-default" : ""} space-y-4`}>
            {prompt && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="hud-label text-text-muted">Style prompt</span>
                  <button onClick={() => { navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary">
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />} copy
                  </button>
                </div>
                <p className="text-sm text-text-secondary">{prompt}</p>
              </div>
            )}
            {lyrics && (<div><span className="hud-label text-text-muted">Lyrics</span><div className="prose-jarvis max-w-none text-sm text-text-secondary mt-1"><ReactMarkdown remarkPlugins={[remarkGfm]}>{lyrics}</ReactMarkdown></div></div>)}
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
}

// What the Musicologist agent understood — genre lineage, tempo, feel, and the
// cultural context it grounded the composition in.
function BriefCard({ brief }: { brief: Brief }) {
  const chips = [
    brief.genre && `${brief.genre}${brief.subgenre ? ` · ${brief.subgenre}` : ""}`,
    brief.bpm && `${brief.bpm} BPM`,
    brief.energy != null && `energy ${brief.energy}/10`,
    brief.vocalStyle,
  ].filter(Boolean) as string[];
  return (
    <div className="rounded-input border border-[#34D399]/20 bg-[#34D399]/[0.04] p-3 space-y-2">
      <div className="flex items-center gap-1.5"><WandSparkles size={12} className="text-[#34D399]" /><span className="hud-label text-[#34D399]">Musicologist brief</span>{(brief.region || brief.era) && <span className="text-[10px] font-mono text-text-muted">· {[brief.region, brief.era].filter(Boolean).join(" · ")}</span>}</div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, idx) => <span key={idx} className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-border-default text-text-secondary">{c}</span>)}
        </div>
      )}
      {brief.moods?.length ? <p className="text-[11px] text-text-muted"><span className="text-text-secondary">Mood:</span> {brief.moods.join(", ")}</p> : null}
      {brief.instruments?.length ? <p className="text-[11px] text-text-muted"><span className="text-text-secondary">Instruments:</span> {brief.instruments.join(", ")}</p> : null}
      {brief.referenceArtists?.length ? <p className="text-[11px] text-text-muted"><span className="text-text-secondary">Reference feel:</span> {brief.referenceArtists.join(", ")}</p> : null}
      {brief.culturalContext ? <p className="text-[11px] text-text-secondary italic leading-relaxed">{brief.culturalContext}</p> : null}
    </div>
  );
}
