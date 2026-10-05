// Deterministic half of Music Studio's Suggest / Enhance / Auto-fill.
// The model is asked for the same things; these run when it is down, copies the
// prompt into a title, or returns a mood the picker cannot show.

import { cleanList, cleanValue } from "./normalize";
import { correctSpelling } from "@/lib/textPolish";

export interface GenreDefaults {
  subgenre: string; instruments: string; artists: string;
  tempo: number; mood: string; energy: number; vocalStyle: string;
}

const MOOD_ALIASES: Record<string, string> = {
  hypnotic: "Hypnotic", driving: "Driving", relentless: "Relentless",
  psychedelic: "Psychedelic", trippy: "Psychedelic", intense: "Intense", raw: "Raw",
  dark: "Dark", euphoric: "Euphoric", aggressive: "Aggressive", groovy: "Groovy",
  energetic: "Energetic", confident: "Confident", epic: "Epic", chill: "Chill",
  ethereal: "Ethereal", uplifting: "Uplifting", intimate: "Intimate", peaceful: "Peaceful",
  mysterious: "Mysterious", haunting: "Haunting", nostalgic: "Nostalgic",
  playful: "Playful", rebellious: "Rebellious", fierce: "Fierce", serene: "Serene",
  melancholic: "Melancholic", moody: "Melancholic", catchy: "Playful",
  anthemic: "Triumphant", triumphant: "Triumphant", warm: "Cozy", cozy: "Cozy",
  smooth: "Serene", "high-energy": "Energetic", "high energy": "Energetic",
  "festival energy": "Euphoric", hard: "Fierce",
};

export function inferGenre(text: string): string {
  const g = correctSpelling(text).toLowerCase();
  const has = (...k: string[]) => k.some((x) => g.includes(x));
  const found: string[] = [];
  const add = (name: string) => { if (!found.includes(name)) found.push(name); };
  if (has("psytrance", "psy trance", "psy-trance", "goa", "psychedelic", "full-on", "full on", "darkpsy", "dark psy", "hi-tech", "hitech", "forest psy", "psycore") || /\bpsy\b/.test(g)) add("Psytrance");
  if (has("acid rave", "acid techno", "hardtek", "tekno", "acid")) add("Acid Rave");
  if (has("speedcore", "extratone")) add("Speedcore");
  else if (has("frenchcore")) add("Frenchcore");
  else if (has("gabber", "hardcore techno")) add("Hardcore");
  if (has("hard techno", "hardtechno")) add("Hard Techno");
  else if (has("techno")) add("Techno");
  if (has("trance") && !has("psytrance", "psy trance")) add("Trance");
  if (has("drum & bass", "drum and bass", "dnb", "d&b")) add("Drum & Bass");
  if (has("dubstep", "riddim")) add("Dubstep");
  if (has("house")) add("House");
  if (has("edm", "electro", "rave")) add("EDM");
  if (has("trap")) add("Trap");
  if (has("hip-hop", "hip hop", "boom bap", "rap")) add("Hip-Hop");
  if (has("metal")) add("Metal");
  if (has("punk")) add("Punk");
  if (has("rock")) add("Rock");
  if (has("cinematic", "orchestral", "epic", "score", "soundtrack")) add("Cinematic");
  if (has("pop")) add("Pop");
  if (has("acoustic", "folk")) add("Folk");
  if (has("indie")) add("Indie");
  if (has("jazz")) add("Jazz");
  if (has("classical")) add("Classical");
  if (has("ambient", "downtempo", "chillout")) add("Ambient");
  if (has("lo-fi", "lofi")) add("Lo-fi");
  if (!found.length) return "Electronic";
  return found.slice(0, 2).join(", ");
}

export function backfill(desc: string, genre: string): GenreDefaults {
  const g = correctSpelling(`${desc} ${genre}`).toLowerCase();
  const has = (...k: string[]) => k.some((x) => g.includes(x));
  let d: GenreDefaults;
  if (has("psytrance", "psy trance", "goa", "psychedelic", "acid") || /\bpsy\b/.test(g)) d = { subgenre: "full-on psytrance", instruments: "rolling triplet bassline, TB-303 acid lead, punchy kick, psy FX, atmospheric pads", artists: "Astrix, Vini Vici, Blastoyz", tempo: 145, mood: "Hypnotic, Driving", energy: 9, vocalStyle: "chanted mantras" };
  else if (has("hard techno", "hardtechno")) d = { subgenre: "hard techno", instruments: "distorted 909 kick, acid lead, industrial stabs, rumble bass, hi-hats", artists: "Charlotte de Witte, I Hate Models", tempo: 150, mood: "Dark, Aggressive", energy: 10, vocalStyle: "vocal stabs" };
  else if (has("techno")) d = { subgenre: "peak-time techno", instruments: "909 drum machine, analog synth bass, acid lead, hi-hats, sub bass", artists: "Charlotte de Witte, Amelie Lens", tempo: 135, mood: "Dark, Energetic", energy: 8, vocalStyle: "vocal stabs" };
  else if (has("trance")) d = { subgenre: "uplifting trance", instruments: "supersaw lead, plucks, rolling bass, kick, crash risers", artists: "Armin van Buuren, Above & Beyond", tempo: 138, mood: "Euphoric", energy: 8, vocalStyle: "airy female vocal" };
  else if (has("drum & bass", "dnb", "d&b")) d = { subgenre: "liquid drum & bass", instruments: "amen breaks, reese bass, pads, piano stabs, sub bass", artists: "Netsky, Sub Focus", tempo: 174, mood: "Energetic", energy: 9, vocalStyle: "soulful vocal" };
  else if (has("dubstep", "riddim")) d = { subgenre: "riddim dubstep", instruments: "wobble bass, growls, snare, hi-hats, sub bass", artists: "Skrillex, Excision", tempo: 150, mood: "Aggressive", energy: 10, vocalStyle: "vocal chops" };
  else if (has("house")) d = { subgenre: "tech house", instruments: "four-on-the-floor kick, groovy bassline, organ stabs, claps, shakers", artists: "Fisher, John Summit", tempo: 126, mood: "Groovy", energy: 7, vocalStyle: "soulful hooks" };
  else if (has("edm", "electro", "rave")) d = { subgenre: "big-room EDM", instruments: "supersaw leads, sidechained bass, kick, risers, white-noise sweeps", artists: "Martin Garrix, Alesso", tempo: 128, mood: "Euphoric, Energetic", energy: 9, vocalStyle: "anthemic vocal" };
  else if (has("trap")) d = { subgenre: "trap", instruments: "808 bass, trap hats, snare, keys, vocal chops", artists: "Metro Boomin, Travis Scott", tempo: 140, mood: "Dark, Confident", energy: 8, vocalStyle: "auto-tuned rap" };
  else if (has("hip-hop", "hip hop", "boom bap", "rap")) d = { subgenre: "boom-bap hip-hop", instruments: "punchy drums, sampled soul loop, upright bass, scratches, keys", artists: "J Dilla, Kendrick Lamar", tempo: 90, mood: "Confident", energy: 7, vocalStyle: "rap / spoken word" };
  else if (has("metal")) d = { subgenre: "metal", instruments: "distorted guitars, double-kick drums, bass guitar, screams", artists: "Metallica, Gojira", tempo: 150, mood: "Aggressive, Fierce", energy: 10, vocalStyle: "screamed / powerful" };
  else if (has("rock", "punk")) d = { subgenre: "alt-rock", instruments: "electric guitar, bass guitar, live drums, vocals", artists: "Foo Fighters, Arctic Monkeys", tempo: 128, mood: "Energetic, Fierce", energy: 8, vocalStyle: "gritty rock vocal" };
  else if (has("cinematic", "orchestral", "epic")) d = { subgenre: "epic orchestral", instruments: "strings, brass, timpani, piano, choir", artists: "Hans Zimmer, Ludwig Göransson", tempo: 90, mood: "Epic", energy: 7, vocalStyle: "epic choir" };
  else if (has("pop")) d = { subgenre: "synth-pop", instruments: "synths, drums, bass, electric guitar, vocals", artists: "Dua Lipa, The Weeknd", tempo: 116, mood: "Uplifting, Playful", energy: 7, vocalStyle: "polished pop vocal" };
  else if (has("acoustic", "folk", "indie")) d = { subgenre: "indie folk", instruments: "acoustic guitar, cajon, upright bass, strings", artists: "Bon Iver, José González", tempo: 95, mood: "Intimate, Cozy", energy: 4, vocalStyle: "soft, intimate" };
  else if (has("jazz")) d = { subgenre: "neo-soul jazz", instruments: "upright bass, brushed drums, piano, saxophone, trumpet", artists: "Robert Glasper, Miles Davis", tempo: 100, mood: "Serene", energy: 5, vocalStyle: "smooth crooning" };
  else if (has("lo-fi", "lofi")) d = { subgenre: "lo-fi hip-hop", instruments: "vinyl crackle, mellow piano, soft drums, warm bass, jazzy guitar", artists: "Nujabes, J Dilla", tempo: 82, mood: "Chill, Nostalgic", energy: 3, vocalStyle: "soft, dreamy" };
  else if (has("ambient", "downtempo")) d = { subgenre: "ambient", instruments: "evolving pads, field recordings, sub drones, soft mallets", artists: "Brian Eno, Jon Hopkins", tempo: 70, mood: "Ethereal, Peaceful", energy: 2, vocalStyle: "wordless textures" };
  else d = { subgenre: "modern electronic", instruments: "synth bass, drum machine, pads, lead synth, percussion", artists: "ODESZA, Flume", tempo: 120, mood: "Uplifting", energy: 6, vocalStyle: "processed vocal" };
  if (has("rap") && !d.vocalStyle.includes("rap")) d = { ...d, vocalStyle: "rap verses" };
  return d;
}

function norm(s: string): string {
  return correctSpelling(s).toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

/** True when a title or theme is just the request written back. */
export function echoesBrief(value: string, brief: string): boolean {
  const a = norm(value);
  const b = norm(brief);
  if (!a || !b) return false;
  if (a === b) return true;
  const briefWords = b.split(" ").filter((w) => w.length > 2);
  const valueWords = a.split(" ");
  if (briefWords.length && briefWords.every((w) => valueWords.includes(w)) && valueWords.length <= briefWords.length + 2) return true;
  return b.length >= 12 && a.includes(b);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

const TITLES: Record<string, string[]> = {
  psy: ["Acid Horizon", "Night Frequency", "Squelch Ritual", "Rolling Dawn", "Forest Signal", "Ion Temple"],
  techno: ["Warehouse Hours", "Iron Pulse", "Concrete Loop", "After the Kick"],
  trance: ["Open Skyline", "Second Sunrise", "Glass Cathedral"],
  dnb: ["Liquid Alloy", "Break the Surface", "Night Bus"],
  hiphop: ["Pocket Watch", "Late Checkout", "Gold Teeth"],
  rock: ["Live Wire", "Paper Crown", "Last Call"],
  ambient: ["Slow Weather", "Room Tone", "Low Tide"],
  pop: ["Sugar Static", "City Lights", "Soft Alarm"],
  cinematic: ["Held Breath", "Wide Frame", "Iron Choir"],
  default: ["Open Frequency", "Second Light", "Quiet Voltage", "Paper Moon"],
};

function titleKey(genre: string): string {
  const g = genre.toLowerCase();
  if (/psy|acid|goa/.test(g)) return "psy";
  if (/techno|house|edm|dubstep|hardcore/.test(g)) return "techno";
  if (/trance/.test(g)) return "trance";
  if (/drum|dnb|bass/.test(g)) return "dnb";
  if (/hip|rap|trap/.test(g)) return "hiphop";
  if (/rock|metal|punk/.test(g)) return "rock";
  if (/ambient|lo-fi|jazz|folk/.test(g)) return "ambient";
  if (/cinematic|orchestral/.test(g)) return "cinematic";
  if (/pop/.test(g)) return "pop";
  return "default";
}

export function evocativeTitle(description: string, genre: string, salt = 0): string {
  const pool = TITLES[titleKey(genre)] ?? TITLES.default;
  const i = (hash(norm(description) || genre) + salt) % pool.length;
  return pool[i];
}

export function snapMoodList(text: string): string[] {
  const parts = text.split(/[,&/]|\band\b/i).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: string[] = [];
  const add = (name: string) => { if (!out.includes(name)) out.push(name); };
  for (const p of parts) {
    if (MOOD_ALIASES[p]) { add(MOOD_ALIASES[p]); continue; }
    const known = Object.keys(MOOD_ALIASES).filter((k) => k.length > 3 && p.includes(k)).sort((a, b) => b.length - a.length)[0];
    if (known) add(MOOD_ALIASES[known]);
  }
  return out.slice(0, 2);
}

export function snapMoods(text: string): string {
  return snapMoodList(text).join(", ");
}

/** The form's genre wins when it agrees with the description. A leftover "Pop" does not. */
export function preferGenre(formGenre: string, hinted: string): string {
  const hint = cleanList(hinted, 3);
  const form = cleanList(formGenre, 3);
  if (!hint.length || hint.join(", ") === "Electronic") return form.join(", ") || hinted || "Electronic";
  if (!form.length || form.every((g) => /^pop$/i.test(g))) return hint.join(", ");
  const n = (s: string) => s.toLowerCase();
  const overlap = hint.some((g) => form.some((f) => n(f).includes(n(g)) || n(g).includes(n(f))));
  if (!overlap) return hint.join(", ");
  const missing = hint.filter((g) => !form.some((f) => n(f).includes(n(g)) || n(g).includes(n(f))));
  return [...form, ...missing].slice(0, 3).join(", ");
}

export function lyricTheme(mood: string, genre: string): string {
  const m = (snapMoodList(mood)[0] || "open").toLowerCase();
  const g = (genre.split(",")[0] || "electronic").trim().toLowerCase();
  return `a ${m} ${g} night`;
}

export function expandPrompt(description: string, genre: string, d: GenreDefaults, salt = 0): string {
  const idea = correctSpelling(description).replace(/[.\s]+$/g, "") || d.subgenre;
  const tempo = Math.min(200, d.tempo + salt * 4);
  const lead = salt ? `A different take on ${idea}` : idea;
  return [
    `${lead}, arranged as ${d.subgenre} around ${tempo} BPM.`,
    `Mood: ${d.mood}. Energy ${d.energy} of 10.`,
    `Instruments: ${d.instruments}.`,
    `In the vein of ${d.artists} — the groove and the palette, not a copy of any record.`,
    d.energy >= 8
      ? "Club form: a tight intro, a long build, a full drop, a breakdown, then a final drop."
      : "Leave space in the arrangement and let the main idea breathe.",
    `Vocals: ${d.vocalStyle}.`,
  ].join(" ");
}

export function tooClose(next: string, prev: string): boolean {
  const a = norm(next);
  const b = norm(prev);
  if (!b) return false;
  if (a === b) return true;
  // A short echo of the note is not an expansion. A real prompt is much longer.
  return a.length < 80 && a.includes(b);
}

export function briefOf(field: string, value: string, context: Record<string, unknown> | undefined): string {
  const raw = field === "description" || field === "prompt"
    ? value
    : cleanValue(context?.description) || cleanValue(context?.prompt);
  return correctSpelling(raw);
}
