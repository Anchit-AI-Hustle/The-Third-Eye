// Song titles must not belong to any released song. MusicBrainz (free, no key)
// is the check; a coined word is the fallback, since an invented word is not
// the title of anything.

const MB = "https://musicbrainz.org/ws/2/recording";
const UA = "TheThirdEye/1.0 (https://the-third-eye.anchit-tandon.com)";

const key = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Whether a released recording already has this title. A failed lookup counts as taken. */
export async function titleTaken(title: string): Promise<boolean> {
  const q = `recording:"${title.replace(/["\\]/g, "")}"`;
  try {
    const r = await fetch(`${MB}?query=${encodeURIComponent(q)}&limit=25&fmt=json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return true;
    const j = (await r.json()) as { recordings?: { title?: string }[] };
    const k = key(title);
    return (j.recordings ?? []).some((x) => key(x.title ?? "") === k);
  } catch {
    return true;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const ONSET = ["v", "z", "k", "th", "dr", "sh", "tr", "x", "m", "r", "l", "n", "q", "br", "kr", "s", "zh", "vr"];
const VOWEL = ["a", "e", "i", "o", "u", "ai", "ae", "y", "ei", "ou"];
const CODA = ["", "n", "r", "x", "th", "k", "l", "s", "nd", "rn"];

/** A pronounceable invented word, the same for the same seed. */
export function coinedWord(seed: string): string {
  let h = hash(seed);
  const pick = <T>(a: T[]) => { const v = a[h % a.length]; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; return v; };
  const syllables = 2 + (h % 2);
  let w = "";
  for (let i = 0; i < syllables; i++) w += pick(ONSET) + pick(VOWEL) + (i === syllables - 1 ? pick(CODA) : "");
  return w[0].toUpperCase() + w.slice(1);
}

const NOUNS: Record<string, string[]> = {
  psy: ["Spiral", "Mantra", "Vortex", "Ritual", "Lattice", "Prism"],
  techno: ["Pressure", "Alloy", "Engine", "Furnace", "Circuit", "Voltage"],
  hiphop: ["Ledger", "Blueprint", "Cipher", "Testament", "Verdict", "Dossier"],
  default: ["Signal", "Current", "Horizon", "Frequency", "Orbit", "Pulse"],
};

function nounKey(genre: string): string {
  const g = genre.toLowerCase();
  if (/psy|goa|trance|acid/.test(g)) return "psy";
  if (/hip|rap|trap|drill|boom/.test(g)) return "hiphop";
  if (/techno|tek|hardcore|gabber|rave|house/.test(g)) return "techno";
  return "default";
}

/** An original title: an invented word plus a genre-flavoured noun. */
export function coinedTitle(seed: string, genre = ""): string {
  const nouns = NOUNS[nounKey(genre)];
  return `${coinedWord(seed)} ${nouns[hash(`${seed}|noun`) % nouns.length]}`;
}

/** The title if no released song has it, else a coined one. */
export async function originalTitle(title: string, seed: string, genre = ""): Promise<string> {
  const t = title.trim();
  return t && !(await titleTaken(t)) ? t : coinedTitle(seed || t, genre);
}
