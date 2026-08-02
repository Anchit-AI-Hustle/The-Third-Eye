import { NextResponse } from "next/server";
import { ADAPTERS } from "@/lib/automation/channels";
import { pickIdea } from "@/lib/automation/content";

// Non-sensitive health check: which channels are connected, whether the LLM key
// is set, and what content is scheduled today. Returns booleans only — never
// any credential values.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const now = new Date();
  const doy = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000);
  const idea = pickIdea(doy);
  return NextResponse.json({
    llm: !!process.env.ANTHROPIC_API_KEY,
    channels: ADAPTERS.map((a) => ({ id: a.id, name: a.name, configured: a.isConfigured() })),
    today: { kind: idea.kind, calculatorSlug: idea.calculatorSlug ?? null },
  });
}
