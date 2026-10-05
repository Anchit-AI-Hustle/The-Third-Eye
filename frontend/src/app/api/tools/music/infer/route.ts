import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { knowledgeContext } from "@/lib/music/knowledge";
import { structuresFor } from "@/lib/music/structures";
import { cleanList, cleanNumber, cleanTempo, cleanValue } from "@/lib/music/normalize";
import { correctSpelling } from "@/lib/textPolish";
import { backfill, echoesBrief, evocativeTitle, inferGenre, lyricTheme, preferGenre, snapMoods } from "@/lib/music/fieldAssist";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `You are an expert music producer. From the song description, fill in a COMPLETE set of production parameters.
CRITICAL RULES:
- Anything the description states explicitly (a BPM, genre, instrument, language, artist) is used EXACTLY as stated — never "corrected" toward a genre average. "200+ BPM" means a tempo of 200 or more.
- EVERY field must have a concrete, specific, non-empty value. Never return "", null, "unknown", or "N/A".
- If the description doesn't state something, choose the most fitting value from the genre knowledge provided (a real song title, 4-6 specific instruments, 1-3 real reference artists of that exact scene, a specific sub-genre, etc.).
- The title is an evocative 2-5 word name. It is never the description, and never a phrase copied from it.
- The lyrics theme is a short original idea. It is never the description.
- Moods are 1-2 of: Hypnotic, Driving, Dark, Euphoric, Aggressive, Energetic, Groovy, Ethereal, Chill, Epic, Confident, Intimate, Psychedelic, Relentless. Comma-separated.
- One value per list item, no trailing punctuation.
Return ONLY a raw JSON object (no prose, no code fences) with EXACTLY these keys:
{
 "title": string,
 "genre": string (1-2 genres, comma-separated — if the request blends genres, e.g. "hard techno rap", name both),
 "subgenre": string (a specific sub-genre),
 "mood": string (1-2 moods, comma-separated),
 "tempo": number (40-400; the genre's real range — e.g. full-on psytrance 142-148, hi-tech 175-200, psycore 200-260, speedcore 250-400),
 "energy": number (1-10),
 "duration": number (15-120 seconds),
 "structure": string (pick the best fit from STRUCTURE OPTIONS below, or adapt one; sections joined with "–"),
 "instruments": string (comma-separated, 4-6 specific instruments),
 "artistInspiration": string (1-3 real reference artists from this exact scene, comma-separated),
 "vocals": boolean,
 "vocalStyle": string (1-2 styles, comma-separated, e.g. "rap verses, powerful"),
 "vocalLanguage": string,
 "vocalIntensity": number (1-10; 1 = soft whisper, 10 = powerful performance),
 "vocalEffects": string (comma-separated, 1-3 fitting effects e.g. "reverb, autotune"),
 "lyricsTheme": string
}`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { description?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const description = (body.description ?? "").trim();
  if (!description) return Response.json({ error: "A description is required" }, { status: 400 });

  const spelled = correctSpelling(description);
  const hint = inferGenre(spelled);
  const structures = structuresFor([hint], spelled);
  let parsed: Record<string, unknown> = {};
  try {
    const out = await llmCascade({
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          `Song description: "${spelled}"`,
          "",
          "GENRE KNOWLEDGE:",
          knowledgeContext({ description: spelled, genre: hint }),
          "",
          "STRUCTURE OPTIONS:",
          ...structures.slice(0, 8).map((x) => `- ${x}`),
        ].join("\n"),
      }],
      jsonMode: true, maxTokens: 900, temperature: 0.4, stage: "music:infer",
    });
    try { parsed = JSON.parse(out.text); }
    catch { const m = out.text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
  } catch { /* fall through to full backfill */ }

  const genre = preferGenre(cleanList(parsed.genre, 3).join(", "), hint);
  const bf = backfill(spelled, genre);
  const modelTitle = cleanValue(parsed.title);
  const theme = cleanValue(parsed.lyricsTheme);

  const fields = {
    description: spelled,
    title: modelTitle && !echoesBrief(modelTitle, spelled) ? modelTitle : evocativeTitle(spelled, genre),
    genre,
    subgenre: cleanList(parsed.subgenre, 2).join(", ") || bf.subgenre,
    mood: snapMoods(cleanList(parsed.mood, 2).join(", ")) || snapMoods(bf.mood),
    tempo: cleanTempo(parsed.tempo) ?? bf.tempo,
    energy: cleanNumber(parsed.energy, 1, 10) ?? bf.energy,
    duration: cleanNumber(parsed.duration, 10, 120) ?? 30,
    structure: cleanValue(parsed.structure) || structuresFor(genre.split(", "))[0],
    instruments: cleanList(parsed.instruments, 8).join(", ") || bf.instruments,
    artistInspiration: cleanList(parsed.artistInspiration, 3).join(", ") || bf.artists,
    vocals: typeof parsed.vocals === "boolean" ? parsed.vocals : true,
    vocalStyle: cleanList(parsed.vocalStyle, 2).join(", ") || bf.vocalStyle,
    vocalLanguage: cleanList(parsed.vocalLanguage, 4).join(", ") || "English",
    vocalIntensity: cleanNumber(parsed.vocalIntensity, 1, 10) ?? bf.energy,
    vocalEffects: cleanList(parsed.vocalEffects, 3).join(", "),
    lyricsTheme: theme && !echoesBrief(theme, spelled) ? theme : lyricTheme(bf.mood, genre),
  };

  return Response.json({ fields });
}
