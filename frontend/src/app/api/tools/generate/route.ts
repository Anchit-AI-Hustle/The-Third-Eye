import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateStudio } from "@/lib/studioGenerate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Studio generation endpoint — powers the Mirror per-mode tools (Landing Page
// Engine, HTML Mailer Architect, Lifecycle OS, Creative Studio). Session-gated
// (it spends provider credits) and routed through the shared studioGenerate →
// llmCascade, so no new API keys are required.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { tool?: string; inputs?: Record<string, string>; mode?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.tool) return Response.json({ error: "Unknown tool" }, { status: 400 });

  try {
    const result = await generateStudio(body.tool, body.inputs ?? {}, body.mode);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Unknown tool")) return Response.json({ error: msg }, { status: 400 });
    if (msg.startsWith("Missing:")) return Response.json({ error: msg }, { status: 400 });
    console.error("studio generate:", msg);
    return Response.json({ error: "Generation failed — all providers unavailable. Check provider keys." }, { status: 503 });
  }
}
