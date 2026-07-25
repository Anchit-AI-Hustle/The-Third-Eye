import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { transcribeCascade } from "@/lib/llmCascade";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper's hard limit

// Speech-to-text via a provider cascade: Groq Whisper (free) → OpenAI Whisper.
// Whichever key is present and not quota-exhausted answers, so transcription
// keeps working when one provider is down or out of credit.
export async function POST(req: NextRequest) {
  // Auth gate: transcription bills a provider — don't leave it open to anyone.
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    return Response.json({ error: "No transcription provider configured (set GROQ_API_KEY or OPENAI_API_KEY)" }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio") as Blob | null;
    const lang = (form.get("lang") as string | null) ?? undefined;

    if (!audio || audio.size < 1000) {
      return Response.json({ text: "" });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: "Audio too large (max 25 MB)" }, { status: 413 });
    }

    const { text, provider } = await transcribeCascade(audio, lang);
    return Response.json({ text, provider });
  } catch (err) {
    console.error("transcribe route error:", err);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
