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

// Deterministic backfill by genre keyword — guarantees non-empty text fields.
function backfillByGenre(desc: string, genre: string) {
  const g = `${genre} ${desc}`.toLowerCase();
  const has = (...k: string[]) => k.some((x) => g.includes(x));
  let instruments = "drums, bass, synth pads, piano";
  let artists = "various";
  let subgenre = "modern";
  if (has("lo-fi", "lofi")) { instruments = "vinyl crackle, mellow piano, soft drums, warm bass, jazzy guitar"; artists = "Nujabes, J Dilla"; subgenre = "lo-fi hip-hop"; }
  else if (has("techno", "hardtechno", "edm", "house")) { instruments = "909 drum machine, analog synth bass, acid lead, hi-hats, sub bass"; artists = "Charlotte de Witte, Amelie Lens"; subgenre = "peak-time techno"; }
  else if (has("hip-hop", "rap", "trap")) { instruments = "808 bass, trap hats, snare, keys, vocal chops"; artists = "Metro Boomin, Kendrick Lamar"; subgenre = "trap"; }
  else if (has("rock", "metal", "punk")) { instruments = "electric guitar, bass guitar, live drums, vocals"; artists = "Foo Fighters, Arctic Monkeys"; subgenre = "alt-rock"; }
  else if (has("cinematic", "orchestral", "epic")) { instruments = "strings, brass, timpani, piano, choir"; artists = "Hans Zimmer, Ludwig Göransson"; subgenre = "epic orchestral"; }
  else if (has("pop")) { instruments = "synths, drums, bass, electric guitar, vocals"; artists = "Dua Lipa, The Weeknd"; subgenre = "synth-pop"; }
  else if (has("acoustic", "folk", "indie")) { instruments = "acoustic guitar, cajon, upright bass, strings"; artists = "Bon Iver, José González"; subgenre = "indie folk"; }
  else if (has("jazz")) { instruments = "upright bass, brushed drums, piano, saxophone, trumpet"; artists = "Miles Davis, Robert Glasper"; subgenre = "neo-soul jazz"; }
  return { instruments, artists, subgenre };
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

  const genre = String(parsed.genre || "Lo-fi");
  const bf = backfillByGenre(description, genre);
  const str = (v: any) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)).trim();
  const titleFallback = description.split(/[.,\n]/)[0].split(" ").slice(0, 4).join(" ") || "Untitled Track";

  // Guarantee every field non-empty.
  const fields = {
    title: str(parsed.title) || titleFallback,
    genre,
    subgenre: str(parsed.subgenre) || bf.subgenre,
    mood: str(parsed.mood) || "Uplifting",
    tempo: Number(parsed.tempo) >= 60 && Number(parsed.tempo) <= 180 ? Math.round(parsed.tempo) : 120,
    energy: Number(parsed.energy) >= 1 && Number(parsed.energy) <= 10 ? Math.round(parsed.energy) : 6,
    duration: Number(parsed.duration) >= 10 && Number(parsed.duration) <= 120 ? Math.round(parsed.duration) : 30,
    structure: str(parsed.structure) || "Verse–Chorus–Bridge",
    instruments: str(parsed.instruments) || bf.instruments,
    artistInspiration: str(parsed.artistInspiration) || bf.artists,
    vocals: typeof parsed.vocals === "boolean" ? parsed.vocals : true,
    vocalStyle: str(parsed.vocalStyle) || "Smooth",
    vocalLanguage: str(parsed.vocalLanguage) || "English",
    lyricsTheme: str(parsed.lyricsTheme) || description.slice(0, 60),
  };

  return Response.json({ fields });
}
