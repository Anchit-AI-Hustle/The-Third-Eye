import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ai: !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY),
    openai: !!process.env.OPENAI_API_KEY,
    supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    google_oauth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    serper: !!process.env.SERPER_API_KEY,
    // llmCascade fallback providers — surfaced so "is the assistant's fallback
    // chain actually configured" is answerable by hitting this endpoint,
    // instead of needing runtime-log access that isn't reachable from every
    // environment (see lib/llmCascade.ts for the fallback order).
    cascade: {
      gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      grok: !!process.env.XAI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      cerebras: !!process.env.CEREBRAS_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY,
      mistral: !!process.env.MISTRAL_API_KEY,
    },
  });
}
