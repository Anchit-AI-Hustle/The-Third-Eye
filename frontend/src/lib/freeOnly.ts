// Free-only guard. There is no switch to turn it off in production: paid providers
// are blocked in code, so a key left in the environment (or saved by a user in
// Settings) cannot make a call that bills.
//
// What is allowed, and why:
//  - OpenRouter: excluded by the owner (OWNER_EXCLUDED), no calls at all. If it is ever re-enabled, only models whose id ends in ":free", which OpenRouter lists at $0 per
//    token. Caveats: free-model daily limits depend on the account's purchased credit, and a
//    key's own credit is never touched by a :free model. Any other model id is refused.
//  - Serper (web search, metered, one-time free credits): same confirmation rule, key "serper".
//  - Groq, Cerebras, Gemini, Mistral, Hugging Face: blocked until the owner lists the
//    provider in FREE_TIER_CONFIRMED (e.g. FREE_TIER_CONFIRMED=groq,cerebras). That list is the
//    owner's own statement that the key is on a free plan with billing off. This code
//    cannot see account billing and does not verify it; it is not proof of zero cost.
//  - OpenAI, Anthropic, Grok, OpenRouter paid models, Replicate, Razorpay, Stripe: always blocked.
//    (ElevenLabs music is blocked too: its free-tier terms for music are unverified.)
//  - Keyless sources and the user's own computer (Ollama) are not affected.

export function freeOnly(): boolean {
  // Test-only escape hatch so the old paid-path unit tests can still run. NODE_ENV is
  // "production" on Vercel, so this can never switch the guard off there.
  return !(process.env.NODE_ENV === "test" && process.env.PAID_PATH_TESTS === "1");
}

/** LLM providers that bill per call. OpenRouter's free models use the "openrouter" name, not this one. */
export const PAID_LLM_PROVIDERS = ["openrouter-paid", "anthropic", "openai", "grok"] as const;

export function isPaidLlmProvider(p: string): boolean {
  return (PAID_LLM_PROVIDERS as readonly string[]).includes(p);
}

/** Owner instruction (16 Nov): OpenRouter is not used at all, free models included. */
export const OWNER_EXCLUDED = ["openrouter"] as const;

const NEEDS_CONFIRMATION = new Set(["groq", "cerebras", "gemini", "gemini-lite", "mistral", "huggingface", "serper"]);

function confirmed(): Set<string> {
  return new Set((process.env.FREE_TIER_CONFIRMED ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean).map((s) => (s === "gemini-lite" ? "gemini" : s)));
}

/** May this provider be called at all under free-only? */
export function providerAllowed(p: string): boolean {
  if (!freeOnly()) return true;
  if (isPaidLlmProvider(p)) return false;
  if ((OWNER_EXCLUDED as readonly string[]).includes(p)) return false;
  if (NEEDS_CONFIRMATION.has(p)) return confirmed().has(p === "gemini-lite" ? "gemini" : p);
  return true;
}

/** Returns the key when the provider is allowed, otherwise "". */
export function gatedKey(p: string, key: string): string {
  return providerAllowed(p) ? key : "";
}

/** OpenRouter only: a model id that is not ":free" can bill the key's credit. */
export function modelAllowed(base: string, model: string): boolean {
  if (!freeOnly()) return true;
  if (base.includes("openrouter.ai")) return /:free$/.test(model);
  return true;
}
