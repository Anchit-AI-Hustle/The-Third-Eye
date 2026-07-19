import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";

export const runtime = "nodejs";
export const maxDuration = 30;

// AI auto-fill — port of MusicGenAI's infer-context edge function. Takes a free
// description and infers the full form (genre, mood, tempo, structure, vocals,
// lyrics theme, instruments, etc.) in one JSON call via the LLM cascade.

const SYSTEM = `You are a music production assistant. Analyze the song description and infer the most likely full set of musical parameters. If a parameter isn't mentioned, infer the best choice from genre conventions. Return ONLY a raw JSON object (no prose, no fences) with these keys:
{
 "title": string (2-5 word song title),
 "genre": string,
 "subgenre": string,
 "mood": string,
 "tempo": number (60-180 BPM),
 "energy": number (1-10),
 "duration": number (seconds, 15-120),
 "structure": string (e.g. "Verse–Chorus–Bridge"),
 "instruments": string (comma-separated, 3-6 items),
 "artistInspiration": string,
 "vocals": boolean,
 "vocalStyle": string,
 "vocalLanguage": string,
 "lyricsTheme": string
}`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { description?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const description = (body.description ?? "").trim();
  if (!description) return Response.json({ error: "A description is required" }, { status: 400 });

  try {
    const out = await llmCascade({
      system: SYSTEM,
      messages: [{ role: "user", content: `Song description: "${description}"` }],
      jsonMode: true, maxTokens: 700, temperature: 0.3,
    });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(out.text); } catch {
      const m = out.text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]);
    }
    return Response.json({ fields: parsed });
  } catch (e) {
    return Response.json({ error: `Inference failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
}
