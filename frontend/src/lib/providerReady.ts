// A short stand-in (the CI placeholder is 14 characters) must not count as a
// live Gemini key. Real Google API keys are ~39 characters.
const MIN_GEMINI_KEY = 30;

const clean = (s?: string) => (s ?? "").replace(/[\u200b\u200e\u200f\ufeff]/g, "").trim();

type EnvLike = Record<string, string | undefined>;

export function usableGeminiKey(env: EnvLike = process.env): string {
  const k = clean(env.GEMINI_API_KEY) || clean(env.GOOGLE_API_KEY);
  return k.length >= MIN_GEMINI_KEY ? k : "";
}

export function systemStatus(env: EnvLike = process.env) {
  const geminiLive = !!usableGeminiKey(env);
  return {
    ai: !!(clean(env.GEMINI_API_KEY) || clean(env.ANTHROPIC_API_KEY)),
    // Whisper is Groq or OpenAI. A live Gemini key transcribes audio too,
    // so the row is not "missing" on a deployment that already has Gemini.
    openai: !!(clean(env.OPENAI_API_KEY) || clean(env.GROQ_API_KEY)) || geminiLive,
    database: !!clean(env.DATABASE_URL),
    google_oauth: !!(clean(env.GOOGLE_CLIENT_ID) && clean(env.GOOGLE_CLIENT_SECRET)),
    serper: !!clean(env.SERPER_API_KEY) || geminiLive,
    // Fallback providers, so "is the assistant's cascade configured" is
    // answerable from this payload (see lib/llmCascade.ts for the order).
    cascade: {
      gemini: !!(clean(env.GEMINI_API_KEY) || clean(env.GOOGLE_API_KEY)),
      anthropic: !!clean(env.ANTHROPIC_API_KEY),
      grok: !!clean(env.XAI_API_KEY),
      groq: !!clean(env.GROQ_API_KEY),
      cerebras: !!clean(env.CEREBRAS_API_KEY),
      openrouter: !!clean(env.OPENROUTER_API_KEY),
      mistral: !!clean(env.MISTRAL_API_KEY),
    },
  };
}
