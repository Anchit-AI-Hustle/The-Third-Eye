import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade, LlmMessage } from "@/lib/llmCascade";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  system?: string;
  messages: LlmMessage[];
  jsonMode?: boolean;
  preferProvider?: "openai" | "anthropic" | "gemini" | "grok" | "groq" | "cerebras" | "ollama";
  maxTokens?: number;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  // Auth gate: this route spends real provider credits — never leave it open.
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 }); }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages: required, non-empty array" }), { status: 400 });
  }

  try {
    // Forward only whitelisted fields — never let the request body set
    // transport internals like timeoutMs (would be an unbounded user-timer).
    const out = await llmCascade({
      system: body.system,
      messages: body.messages,
      jsonMode: body.jsonMode,
      preferProvider: body.preferProvider,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
    });
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("llm route error:", e);
    return new Response(JSON.stringify({ error: "Upstream LLM providers unavailable" }), { status: 503 });
  }
}
