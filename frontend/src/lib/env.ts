// The frontend's environment in one place: what must be set for the app to run
// safely, and what each optional var turns on. Checked once at server boot by
// src/instrumentation.ts. Only names are ever logged, never values.

type Rule = (v: string) => boolean;
type EnvVar = { name: string; required: boolean; purpose: string; valid?: Rule; llm?: true };

const url: Rule = (v) => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } };
const postgres: Rule = (v) => { try { return /^postgres(ql)?:$/.test(new URL(v).protocol); } catch { return false; } };
const PROVIDERS = ["openai", "anthropic", "gemini", "gemini-lite", "grok", "groq", "cerebras", "openrouter", "mistral"];

const llm = (name: string, provider: string): EnvVar => ({ name, required: false, purpose: `${provider} in the AI cascade`, llm: true });

export const ENV_SCHEMA: EnvVar[] = [
  { name: "NEXTAUTH_SECRET", required: true, purpose: "signs session JWTs" },
  { name: "DATABASE_URL", required: true, purpose: "Postgres for all saved data", valid: postgres },
  { name: "TOKEN_ENCRYPTION_KEY", required: true, purpose: "encrypts stored connector tokens" },
  { name: "NEXTAUTH_URL", required: false, purpose: "canonical sign-in callback URL", valid: url },
  llm("OPENAI_API_KEY", "OpenAI"),
  llm("ANTHROPIC_API_KEY", "Anthropic"),
  llm("GEMINI_API_KEY", "Gemini"),
  llm("GOOGLE_API_KEY", "Gemini (alternate name)"),
  llm("XAI_API_KEY", "Grok"),
  llm("GROQ_API_KEY", "Groq"),
  llm("CEREBRAS_API_KEY", "Cerebras"),
  llm("OPENROUTER_API_KEY", "OpenRouter"),
  llm("MISTRAL_API_KEY", "Mistral"),
  { name: "LLM_PRIMARY_PROVIDER", required: false, purpose: "paid provider tried first", valid: (v) => PROVIDERS.includes(v.toLowerCase()) },
  { name: "GOOGLE_CLIENT_ID", required: false, purpose: "Google sign-in and Gmail/Calendar connect" },
  { name: "GOOGLE_CLIENT_SECRET", required: false, purpose: "Google sign-in and Gmail/Calendar connect" },
  { name: "CRON_SECRET", required: false, purpose: "scheduled jobs and reminders while the app is closed" },
  { name: "SERPER_API_KEY", required: false, purpose: "Google results for search; keyless sources are used without it" },
  { name: "OPENWEATHER_API_KEY", required: false, purpose: "weather" },
  { name: "WHATSAPP_TOKEN", required: false, purpose: "WhatsApp chat and updates" },
  { name: "WHATSAPP_PHONE_NUMBER_ID", required: false, purpose: "WhatsApp chat and updates" },
  { name: "WHATSAPP_APP_SECRET", required: false, purpose: "WhatsApp webhook signature check" },
  { name: "WHATSAPP_VERIFY_TOKEN", required: false, purpose: "WhatsApp webhook verification" },
  { name: "STRIPE_SECRET_KEY", required: false, purpose: "payments" },
  { name: "STRIPE_WEBHOOK_SECRET", required: false, purpose: "payment webhooks" },
  { name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", required: false, purpose: "push notifications" },
  { name: "VAPID_PRIVATE_KEY", required: false, purpose: "push notifications" },
  { name: "GITHUB_CLIENT_ID", required: false, purpose: "GitHub connector" },
  { name: "GITHUB_CLIENT_SECRET", required: false, purpose: "GitHub connector" },
  { name: "ELEVENLABS_API_KEY", required: false, purpose: "voice and music generation" },
  { name: "REPLICATE_API_TOKEN", required: false, purpose: "image and video generation" },
];

type Env = Record<string, string | undefined>;
const value = (env: Env, name: string) => (env[name] ?? "").replace(/[\u200b\u200e\u200f\ufeff]/g, "").trim();

export function validateEnv(env: Env) {
  const missingRequired: string[] = [];
  const missingOptional: EnvVar[] = [];
  const invalid: EnvVar[] = [];
  for (const v of ENV_SCHEMA) {
    const s = value(env, v.name);
    if (!s) (v.required ? missingRequired.push(v.name) : !v.llm && missingOptional.push(v));
    else if (v.valid && !v.valid(s)) invalid.push(v);
  }
  const noLlm = !ENV_SCHEMA.some((v) => v.llm && value(env, v.name)) && env.OLLAMA_ENABLED !== "1";
  return { missingRequired, missingOptional, invalid, noLlm };
}

/** Fails boot in production on a missing or malformed required var; everything else is a log line. */
export function checkEnv(env: Env, { production }: { production: boolean }) {
  const r = validateEnv(env);
  const badRequired = [...r.missingRequired, ...r.invalid.filter((v) => v.required).map((v) => `${v.name} (malformed)`)];
  if (badRequired.length) {
    const msg = `Required environment variables missing or invalid: ${badRequired.join(", ")}. Set them in Vercel project settings.`;
    if (production) throw new Error(msg);
    console.error(msg);
  }
  const notes = [
    ...r.missingOptional.map((v) => `${v.name} (${v.purpose})`),
    ...r.invalid.filter((v) => !v.required).map((v) => `${v.name} is malformed, ignored (${v.purpose})`),
  ];
  if (notes.length) console.warn(`Optional environment variables not set, these features are off: ${notes.join("; ")}`);
  if (r.noLlm) console.warn("No AI provider key is set: chat, extraction and agents cannot answer until one is added.");
}
