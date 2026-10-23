"use client";

import { useEffect, useState } from "react";

// What the dashboard says about the system, read from /api/health instead of
// written into the page. null until it answers.
export interface SystemHealth {
  ai: "ok" | "degraded" | "down";
  /** The provider chat uses first, e.g. "Groq". */
  aiProvider: string | null;
  database: boolean;
  google: boolean;
}

const NAMES: Record<string, string> = {
  groq: "Groq", "gemini-lite": "Gemini Flash-Lite", gemini: "Gemini", cerebras: "Cerebras", openrouter: "OpenRouter",
  mistral: "Mistral", openai: "OpenAI", grok: "Grok",
};

export function useSystemHealth(): SystemHealth | null {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/health").then((r) => r.json()).then((d) => {
      if (!live) return;
      const providers = (d.llm?.providers ?? {}) as Record<string, string>;
      const first = Object.entries(providers).find(([, s]) => s === "ok")?.[0] ?? null;
      setHealth({
        ai: !d.llm_available || !first ? "down" : d.llm?.status === "ok" ? "ok" : "degraded",
        aiProvider: first ? NAMES[first] ?? first : null,
        database: !!d.services?.database,
        google: !!d.services?.google_oauth,
      });
    }).catch(() => { if (live) setHealth({ ai: "down", aiProvider: null, database: false, google: false }); });
    return () => { live = false; };
  }, []);
  return health;
}
