import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Probes all LLM providers + key services. Returns a snapshot of what's
// configured + a quick "any" flag the dashboard uses to surface a banner.

export async function GET(_req: NextRequest) {
  const env = process.env;
  const clean = (s?: string) => (s ?? "").replace(/[​‎‏﻿]/g, "").trim();

  const providers = {
    openai:    [env.OPENAI_API_KEY, env.OPENAI_API_KEY_2, env.OPENAI_API_KEY_3].map(clean).filter(Boolean).length,
    anthropic: !!clean(env.ANTHROPIC_API_KEY),
    gemini:    !!(clean(env.GEMINI_API_KEY) || clean(env.GOOGLE_API_KEY)),
    grok:      !!clean(env.XAI_API_KEY),
    groq:      !!clean(env.GROQ_API_KEY),
    cerebras:  !!clean(env.CEREBRAS_API_KEY),
    ollama:    env.OLLAMA_ENABLED === "1",
  };

  const services = {
    serper:        !!clean(env.SERPER_API_KEY),
    openweather:   !!clean(env.OPENWEATHER_API_KEY),
    supabase:      !!(clean(env.NEXT_PUBLIC_SUPABASE_URL) && clean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
    google_oauth:  !!(clean(env.GOOGLE_CLIENT_ID) && clean(env.GOOGLE_CLIENT_SECRET)),
  };

  const llm_available =
    providers.openai > 0 || providers.anthropic || providers.gemini ||
    providers.grok || providers.groq || providers.cerebras || providers.ollama;

  return new Response(JSON.stringify({
    ok: llm_available,
    ai: llm_available,                 // legacy alias for SettingsClient
    llm_available,
    providers,
    services,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
