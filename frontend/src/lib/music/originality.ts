// Song titles must not belong to any released song. MusicBrainz (free, no key)
// is the check. The fallback is two real, evocative words chosen for the
// genre (and from the description where it has a vivid one): far less likely
// to be a released title than a common phrase, and it still reads like a song.

const MB = "https://musicbrainz.org/ws/2/recording";
const UA = "TheThirdEye/1.0 (https://the-third-eye.anchit-tandon.com)";

const key = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Whether a released recording has this title; "unknown" when MusicBrainz could not be asked. */
export async function titleStatus(title: string): Promise<"taken" | "free" | "unknown"> {
  const q = `recording:"${title.replace(/["\\]/g, "")}"`;
  try {
    const r = await fetch(`${MB}?query=${encodeURIComponent(q)}&limit=25&fmt=json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return "unknown";
    const j = (await r.json()) as { recordings?: { title?: string }[] };
    const k = key(title);
    return (j.recordings ?? []).some((x) => key(x.title ?? "") === k) ? "taken" : "free";
  } catch {
    return "unknown";
  }
}

/** For titles published without review: a failed lookup counts as taken. */
export async function titleTaken(title: string): Promise<boolean> {
  return (await titleStatus(title)) !== "free";
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// Words that make a title a picture. One from the description wins over the
// genre's list, so "soul sample with brass stabs" gives "Brass …" or "Soul …".
const VIVID = new Set([
  "midnight", "neon", "velvet", "golden", "gold", "concrete", "silver", "crimson", "amber", "electric", "static",
  "paper", "glass", "iron", "copper", "smoke", "ember", "thunder", "rain", "river", "ocean", "desert", "winter",
  "summer", "city", "street", "skyline", "moon", "sun", "fire", "storm", "shadow", "echo", "ghost", "wild",
  "brass", "soul", "gritty", "dusty", "hazy", "cosmic", "lunar", "solar", "northern", "southern", "hollow",
  "broken", "restless", "quiet", "heavy", "bright", "dark", "cold", "warm", "late", "last",
]);

const ADJECTIVES: Record<string, string[]> = {
  psy: ["Lunar", "Cosmic", "Liquid", "Ancient", "Hollow", "Electric"],
  techno: ["Concrete", "Iron", "Static", "Midnight", "Heavy", "Cold"],
  hiphop: ["Concrete", "Golden", "Dusty", "Late", "Paper", "Velvet"],
  default: ["Midnight", "Golden", "Northern", "Quiet", "Bright", "Restless"],
};

const NOUNS: Record<string, string[]> = {
  psy: ["Spiral", "Mantra", "Vortex", "Ritual", "Lattice", "Prism"],
  techno: ["Pressure", "Alloy", "Engine", "Furnace", "Circuit", "Voltage"],
  hiphop: ["Ledger", "Blueprint", "Cipher", "Testament", "Verdict", "Dossier"],
  default: ["Signal", "Current", "Horizon", "Frequency", "Orbit", "Pulse"],
};

function genreKey(genre: string): string {
  const g = genre.toLowerCase();
  if (/psy|goa|trance|acid/.test(g)) return "psy";
  if (/hip|rap|trap|drill|boom/.test(g)) return "hiphop";
  if (/techno|tek|hardcore|gabber|rave|house/.test(g)) return "techno";
  return "default";
}

/** Two real words: a vivid one (from the description when it has one) and a genre noun. */
export function coinedTitle(seed: string, genre = ""): string {
  const k = genreKey(genre);
  const noun = NOUNS[k][hash(`${seed}|noun`) % NOUNS[k].length];
  const fromBrief = [...new Set(seed.toLowerCase().match(/\p{L}+/gu) ?? [])].filter((w) => VIVID.has(w));
  const pool = fromBrief.length ? fromBrief : ADJECTIVES[k];
  const word = pool[hash(`${seed}|word`) % pool.length];
  return `${word[0].toUpperCase()}${word.slice(1)} ${noun}`;
}

/**
 * The suggested title unless a released song has it, then a coined one. A
 * suggestion the user reviews keeps its title when MusicBrainz can't be asked.
 */
export async function originalTitle(title: string, seed: string, genre = ""): Promise<string> {
  const t = title.trim();
  return t && (await titleStatus(t)) !== "taken" ? t : coinedTitle(seed || t, genre);
}
