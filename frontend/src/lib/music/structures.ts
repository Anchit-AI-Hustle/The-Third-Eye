// Song structures, by genre family. A structure is also the lyric plan: its
// section names become the Lyricist's section tags, in order — so a psytrance
// track gets builds, drops and a mantra breakdown instead of pop verses and
// choruses that the genre never has.

interface Family {
  keys: string[];
  structures: string[];
}

const FAMILIES: Family[] = [
  {
    keys: ["psy", "goa", "full-on", "full on", "forest", "hi-tech", "hitech", "darkpsy", "dark psy", "psycore", "trance", "acid", "rave"],
    structures: [
      "Intro–Groove–Acid Build–Drop–Mantra Breakdown–Build–Drop–Outro",
      "Intro–Build–Drop–Vocal Break–Drop–Acid Break–Final Drop–Outro",
      "DJ Intro–Main Groove–Breakdown–Peak–Main Groove–DJ Outro",
      "Intro–Kick & Bass–Lead Theme–Breakdown–Climax–Outro",
      "Intro–Rapid Build–Drop–Glitch Break–Drop–Outro",
    ],
  },
  {
    keys: ["techno", "hardcore", "frenchcore", "speedcore", "gabber", "hardstyle", "industrial", "hardtek", "tekno"],
    structures: [
      "Intro–Build–Drop–Break–Drop–Outro",
      "DJ Intro–Loop A–Loop B–Break–Loop A–DJ Outro",
      "Intro–Build–Drop–Screech Break–Build–Drop–Outro",
    ],
  },
  {
    keys: ["house", "edm", "dance", "electro", "garage", "amapiano"],
    structures: [
      "Intro–Verse–Build–Drop–Verse–Build–Drop–Outro",
      "Intro–Build–Drop–Breakdown–Build–Drop–Outro",
      "Intro–Groove–Vocal Hook–Groove–Break–Vocal Hook–Outro",
    ],
  },
  {
    keys: ["drum", "dnb", "d&b", "jungle", "dubstep", "riddim", "bass"],
    structures: [
      "Intro–Build–Drop–Halftime Break–Build–Drop–Outro",
      "Intro–Verse–Build–Drop–Verse–Drop–Outro",
    ],
  },
  {
    keys: ["hip", "rap", "trap", "drill", "boom", "grime"],
    structures: [
      "Intro–Verse–Hook–Verse–Hook–Bridge–Hook–Outro",
      "Intro–Hook–Verse–Hook–Verse–Hook",
      "Intro–Verse–Pre-hook–Hook–Verse–Pre-hook–Hook–Outro",
    ],
  },
  {
    keys: ["cinematic", "orchestral", "classical", "ambient", "score", "new age", "minimal"],
    structures: [
      "Intro–Rise–Climax–Resolution",
      "Theme–Development–Recapitulation",
      "Theme and variations",
      "Through-composed (no repeats)",
    ],
  },
];

const GENERAL = [
  "Verse–Chorus–Verse–Chorus–Bridge–Chorus",
  "Intro–Verse–Chorus–Verse–Chorus–Bridge–Chorus–Outro",
  "Intro–Verse–Pre-chorus–Chorus–Verse–Pre-chorus–Chorus–Bridge–Chorus–Outro",
  "Intro–Build–Drop–Breakdown–Drop–Outro",
  "Intro–Theme–Solo–Theme–Outro",
  "AABA",
  "12-bar blues",
  "Call-and-response loop",
  "Rondo (ABACA)",
];

/** Structures for these genres first, then the general ones — no duplicates. */
export function structuresFor(genres: string[], subgenre = ""): string[] {
  const hay = [...genres, subgenre].join(" ").toLowerCase();
  const matched = FAMILIES.filter((f) => f.keys.some((k) => hay.includes(k))).flatMap((f) => f.structures);
  return [...new Set([...matched, ...GENERAL])];
}

/** "Intro–Kick & Bass (16 bars) → Outro" → ["intro", "kick and bass", "outro"]. */
export function sectionsOf(structure: string): string[] {
  if (!/[–→>|,]|\s-\s/.test(structure)) return [];
  return structure
    .split(/\s*(?:–|→|->|>|\||,|\s-\s)\s*/)
    .map((s) => s.replace(/\(.*?\)/g, "").replace(/\d+\s*bars?/gi, "").replace(/&/g, "and").replace(/\s+/g, " ").trim().toLowerCase())
    .filter((s) => /^[a-z][a-z' -]{0,23}$/.test(s));
}
