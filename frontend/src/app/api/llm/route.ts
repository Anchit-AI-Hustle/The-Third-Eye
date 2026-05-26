import { NextRequest } from "next/server";
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
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 }); }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages: required, non-empty array" }), { status: 400 });
  }

  try {
    const out = await llmCascade(body);
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 503 });
  }
}
