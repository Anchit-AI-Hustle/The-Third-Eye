import OpenAI from "openai";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio") as Blob | null;
    const lang = (form.get("lang") as string | null) ?? undefined;

    if (!audio || audio.size < 1000) {
      return Response.json({ text: "" });
    }

    const openai = new OpenAI({ apiKey });

    const file = new File([audio], "audio.webm", { type: audio.type || "audio/webm" });

    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      ...(lang ? { language: lang.split("-")[0] } : {}),
      response_format: "text",
    });

    return Response.json({ text: typeof result === "string" ? result : (result as any).text ?? "" });
  } catch (err) {
    console.error("transcribe route error:", err);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
