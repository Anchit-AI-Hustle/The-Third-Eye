import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8 MB decoded — plenty for a frame

// E.D.I.T.H. vision: analyze a captured frame (screen share or webcam) with a
// question, via the multimodal Gemini model. Auth-gated (it spends provider
// credits) and self-contained — the client sends one still frame as a data URL.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 503 });
  }

  let body: { image?: string; prompt?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const image = body.image ?? "";
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(image);
  if (!m) return Response.json({ error: "image must be a PNG/JPEG/WebP data URL" }, { status: 400 });
  const mimeType = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  const data = m[2];
  if (data.length * 0.75 > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image too large (max 8 MB)" }, { status: 413 });
  }

  const prompt = (body.prompt ?? "").trim() ||
    "Describe what's on this screen/image concisely, and call out anything notable or actionable.";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction:
        "You are E.D.I.T.H., analyzing what the user is showing you (a screenshot or camera frame). " +
        "Be precise and useful: describe what you see, extract any visible text/data asked for, and surface " +
        "anything notable or actionable. Never invent details that aren't visible.",
    });
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data } },
    ]);
    return Response.json({ text: result.response.text() });
  } catch (e) {
    console.error("vision route error:", e);
    return Response.json({ error: "Vision analysis failed" }, { status: 500 });
  }
}
