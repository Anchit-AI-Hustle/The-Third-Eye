import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";

export const runtime = "nodejs";
export const maxDuration = 30;

// AI auto-fill — port of MusicGenAI's infer-context. Infers the FULL form from a
// description in one JSON call, and guarantees every field is non-empty via a
// deterministic backfill (so nothing is ever left blank).

const SYSTEM = `You are an expert music producer. From the song description, fill in a COMPLETE set of production parameters.
CRITICAL RULES:
- EVERY field must have a concrete, specific, non-empty value. Never return "", null, "unknown", or "N/A".
- If the description doesn't state something, INVENT the most fitting choice from genre conventions (a real song title, 4-6 specific instruments, 1-2 real reference artists, a specific sub-genre, etc.).
Return ONLY a raw JSON object (no prose, no code fences) with EXACTLY these keys:
{
 "title": string (an evocative 2-5 word song title),
 "genre": string,
 "subgenre": string (a specific sub-genre),
 "mood": string,
 "tempo": number (60-180),
 "energy": number (1-10),
 "duration": number (15-120 seconds),
 "structure": string,
 "instruments": string (comma-separated, 4-6 specific instruments),
 "artistInspiration": string (1-2 real reference artists, comma-separated),
 "vocals": boolean,
 "vocalStyle": string,
 "vocalLanguage": string,
 "lyricsTheme": string (a short phrase)
}`;

// Infer a genre from free text when the model doesn't return one — so the
// deterministic fallback matches what the user actually asked for (never a
// hardcoded default that then poisons the keyword match).
function inferGenre(text: string): string {
  const g = text.toLowerCase();
  const has = (...k: string[]) => k.some((x) => g.includes(x));
  if (has("psytrance", "psy trance", "psy-trance", "goa")) return "Psytrance";
  if (has("hard techno", "hardtechno")) return "Hard Techno";
  if (has("techno")) return "Techno";
  if (has("trance")) return "Trance";
  if (has("drum & bass", "drum and bass", "dnb", "d&b")) return "Drum & Bass";
  if (has("dubstep", "riddim")) return "Dubstep";
  if (has("house")) return "House";
  if (has("edm", "electro", "rave")) return "EDM";
  if (has("trap")) return "Trap";
  if (has("hip-hop", "hip hop", "boom bap", "rap")) return "Hip-Hop";
  if (has("metal")) return "Metal";
  if (has("punk")) return "Punk";
  if (has("rock")) return "Rock";
  if (has("cinematic", "orchestral", "epic", "score", "soundtrack")) return "Cinematic";
  if (has("pop")) return "Pop";
  if (has("acoustic", "folk")) return "Folk";
  if (has("indie")) return "Indie";
  if (has("jazz")) return "Jazz";
  if (has("classical")) return "Classical";
  if (has("ambient", "downtempo", "chillout")) return "Ambient";
  if (has("lo-fi", "lofi")) return "Lo-fi";
  return "Electronic";
}

interface GenreDefaults {
  subgenre: string; instruments: string; artists: string;
  tempo: number; mood: string; energy: number; vocalStyle: string;
}

// Deterministic, genre-appropriate defaults keyed off the DESCRIPTION (with the
// genre as a secondary hint). Guarantees coherent non-empty fields even when the
// model is unavailable. Order: most specific first.
function backfill(desc: string, genre: string): GenreDefaults {
  const g = `${desc} ${genre}`.toLowerCase();
  const has = (...k: string[]) => k.some((x) => g.includes(x));
  let d: GenreDefaults;
  if (has("psytrance", "psy trance", "goa", "psy", "acid")) d = { subgenre: "psytrance / acid", instruments: "TB-303 acid bassline, psy leads, 909 kick, rolling hi-hats, atmospheric pads", artists: "Astrix, Vini Vici", tempo: 145, mood: "Hypnotic & driving", energy: 9, vocalStyle: "processed chants" };
  else if (has("hard techno", "hardtechno")) d = { subgenre: "hard techno", instruments: "distorted 909 kick, acid lead, industrial stabs, rumble bass, hi-hats", artists: "Charlotte de Witte, I Hate Models", tempo: 150, mood: "Dark & relentless", energy: 10, vocalStyle: "vocal stabs" };
  else if (has("techno")) d = { subgenre: "peak-time techno", instruments: "909 drum machine, analog synth bass, acid lead, hi-hats, sub bass", artists: "Charlotte de Witte, Amelie Lens", tempo: 135, mood: "Driving", energy: 8, vocalStyle: "vocal stabs" };
  else if (has("trance")) d = { subgenre: "uplifting trance", instruments: "supersaw lead, plucks, rolling bass, kick, crash risers", artists: "Armin van Buuren, Above & Beyond", tempo: 138, mood: "Euphoric", energy: 8, vocalStyle: "airy female vocal" };
  else if (has("drum & bass", "dnb", "d&b")) d = { subgenre: "liquid drum & bass", instruments: "amen breaks, reese bass, pads, piano stabs, sub bass", artists: "Netsky, Sub Focus", tempo: 174, mood: "Energetic", energy: 9, vocalStyle: "soulful vocal" };
  else if (has("dubstep", "riddim")) d = { subgenre: "riddim dubstep", instruments: "wobble bass, growls, snare, hi-hats, sub bass", artists: "Skrillex, Excision", tempo: 150, mood: "Aggressive", energy: 10, vocalStyle: "vocal chops" };
  else if (has("house")) d = { subgenre: "tech house", instruments: "four-on-the-floor kick, groovy bassline, organ stabs, claps, shakers", artists: "Fisher, John Summit", tempo: 126, mood: "Groovy", energy: 7, vocalStyle: "soulful hooks" };
  else if (has("edm", "electro", "rave")) d = { subgenre: "big-room EDM", instruments: "supersaw leads, sidechained bass, kick, risers, white-noise sweeps", artists: "Martin Garrix, Alesso", tempo: 128, mood: "Festival energy", energy: 9, vocalStyle: "anthemic vocal" };
  else if (has("trap")) d = { subgenre: "trap", instruments: "808 bass, trap hats, snare, keys, vocal chops", artists: "Metro Boomin, Travis Scott", tempo: 140, mood: "Hard & moody", energy: 8, vocalStyle: "auto-tuned rap" };
  else if (has("hip-hop", "hip hop", "boom bap", "rap")) d = { subgenre: "boom-bap hip-hop", instruments: "punchy drums, sampled soul loop, upright bass, scratches, keys", artists: "J Dilla, Kendrick Lamar", tempo: 90, mood: "Confident", energy: 7, vocalStyle: "rap / spoken word" };
  else if (has("metal")) d = { subgenre: "metal", instruments: "distorted guitars, double-kick drums, bass guitar, screams", artists: "Metallica, Gojira", tempo: 150, mood: "Aggressive", energy: 10, vocalStyle: "screamed / powerful" };
  else if (has("rock", "punk")) d = { subgenre: "alt-rock", instruments: "electric guitar, bass guitar, live drums, vocals", artists: "Foo Fighters, Arctic Monkeys", tempo: 128, mood: "Anthemic", energy: 8, vocalStyle: "gritty rock vocal" };
  else if (has("cinematic", "orchestral", "epic")) d = { subgenre: "epic orchestral", instruments: "strings, brass, timpani, piano, choir", artists: "Hans Zimmer, Ludwig Göransson", tempo: 90, mood: "Epic", energy: 7, vocalStyle: "epic choir" };
  else if (has("pop")) d = { subgenre: "synth-pop", instruments: "synths, drums, bass, electric guitar, vocals", artists: "Dua Lipa, The Weeknd", tempo: 116, mood: "Catchy", energy: 7, vocalStyle: "polished pop vocal" };
  else if (has("acoustic", "folk", "indie")) d = { subgenre: "indie folk", instruments: "acoustic guitar, cajon, upright bass, strings", artists: "Bon Iver, José González", tempo: 95, mood: "Warm & intimate", energy: 4, vocalStyle: "soft, intimate" };
  else if (has("jazz")) d = { subgenre: "neo-soul jazz", instruments: "upright bass, brushed drums, piano, saxophone, trumpet", artists: "Robert Glasper, Miles Davis", tempo: 100, mood: "Smooth", energy: 5, vocalStyle: "smooth crooning" };
  else if (has("lo-fi", "lofi")) d = { subgenre: "lo-fi hip-hop", instruments: "vinyl crackle, mellow piano, soft drums, warm bass, jazzy guitar", artists: "Nujabes, J Dilla", tempo: 82, mood: "Chill", energy: 3, vocalStyle: "soft, dreamy" };
  else if (has("ambient", "downtempo")) d = { subgenre: "ambient", instruments: "evolving pads, field recordings, sub drones, soft mallets", artists: "Brian Eno, Jon Hopkins", tempo: 70, mood: "Ethereal", energy: 2, vocalStyle: "wordless textures" };
  else d = { subgenre: "modern electronic", instruments: "synth bass, drum machine, pads, lead synth, percussion", artists: "ODESZA, Flume", tempo: 120, mood: "Uplifting", energy: 6, vocalStyle: "processed vocal" };
  // Rap is often layered onto electronic tracks — reflect it in the vocal style.
  if (has("rap") && !d.vocalStyle.includes("rap")) d = { ...d, vocalStyle: "rap verses" };
  return d;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { description?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const description = (body.description ?? "").trim();
  if (!description) return Response.json({ error: "A description is required" }, { status: 400 });

  let parsed: Record<string, any> = {};
  try {
    const out = await llmCascade({
      system: SYSTEM,
      messages: [{ role: "user", content: `Song description: "${description}"` }],
      jsonMode: true, maxTokens: 800, temperature: 0.55,
    });
    try { parsed = JSON.parse(out.text); }
    catch { const m = out.text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
  } catch { /* fall through to full backfill */ }

  // Genre comes from the model, else is inferred from the description — never a
  // hardcoded default that would drag the whole fallback off-genre.
  const str = (v: any) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)).trim();
  const genre = str(parsed.genre) || inferGenre(description);
  const bf = backfill(description, genre);
  const titleFallback = description.split(/[.,\n]/)[0].split(" ").slice(0, 4).join(" ") || "Untitled Track";

  // Guarantee every field non-empty — and genre-appropriate when the model omits it.
  const fields = {
    title: str(parsed.title) || titleFallback,
    genre,
    subgenre: str(parsed.subgenre) || bf.subgenre,
    mood: str(parsed.mood) || bf.mood,
    tempo: Number(parsed.tempo) >= 60 && Number(parsed.tempo) <= 180 ? Math.round(parsed.tempo) : bf.tempo,
    energy: Number(parsed.energy) >= 1 && Number(parsed.energy) <= 10 ? Math.round(parsed.energy) : bf.energy,
    duration: Number(parsed.duration) >= 10 && Number(parsed.duration) <= 120 ? Math.round(parsed.duration) : 30,
    structure: str(parsed.structure) || "Verse–Chorus–Bridge",
    instruments: str(parsed.instruments) || bf.instruments,
    artistInspiration: str(parsed.artistInspiration) || bf.artists,
    vocals: typeof parsed.vocals === "boolean" ? parsed.vocals : true,
    vocalStyle: str(parsed.vocalStyle) || bf.vocalStyle,
    vocalLanguage: str(parsed.vocalLanguage) || "English",
    lyricsTheme: str(parsed.lyricsTheme) || description.slice(0, 60),
  };

  return Response.json({ fields });
}
