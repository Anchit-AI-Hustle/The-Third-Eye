import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { visionCascade } from "@/lib/llmCascade";
import { withOwnKeys } from "@/lib/providerKeys";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8 MB decoded — plenty for a frame

// E.D.I.T.H. vision: analyze a captured frame (screen share or webcam) with a
// question. Uses a multimodal provider cascade (Gemini → OpenAI)
// so it keeps working when the primary provider is rate-limited or out of
// credit. Auth-gated (it spends provider credits); the client sends one still
// frame as a data URL.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
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
    // The user's own consented key counts here too; with none, the cascade says so.
    const { text, provider } = await withOwnKeys(session.user.email, () => visionCascade({
      image: { mimeType, data },
      prompt,
      system:
        "You are E.D.I.T.H., analyzing what the user is showing you (a screenshot or camera frame). " +
        "Be precise and useful: describe what you see, extract any visible text/data asked for, and surface " +
        "anything notable or actionable. Never invent details that aren't visible.",
    }));
    return Response.json({ text, provider });
  } catch (e) {
    console.error("vision route error:", e);
    const none = e instanceof Error && /no keys configured|no AI provider key is configured/i.test(e.message);
    return Response.json({
      error: none
        ? "Image analysis isn't available right now: no free vision model is set up. Add your own Gemini key in Settings and tick Use this key, or try again later."
        : "Vision analysis failed",
    }, { status: none ? 503 : 500 });
  }
}
