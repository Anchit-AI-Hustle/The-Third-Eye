// LLM cascade — ported from marketing_mailers__html_architect/api/_shared/llm.js
//
// Order: OpenAI → Anthropic → Gemini → xAI/Grok → Groq → Cerebras → OpenRouter
//        → Mistral → Ollama
// Groq, Cerebras, OpenRouter (:free models) and Mistral all offer generous FREE
// tiers, so the app keeps working on free keys alone.
// First provider with a non-quota-exhausted key returns. Quota / rate-limit /
// "credit balance too low" errors fall through to the next tier without
// failing the request.
//
// Use this for any LLM call where vendor-specific features (tool use, image
// gen) are NOT required. The chat assistant still uses Gemini directly for
// function calling — this cascade is for translate / multi-agent reasoning /
// other plain-text generations where any model will do.

import { usableGeminiKey } from "@/lib/providerReady";
import { backgroundBlocked, benchedReason, classifyFailure, healthMap, noteFailure, noteSuccess } from "@/lib/providerHealth";
import { currentOwnKeys } from "@/lib/providerKeys";

type LlmRole = "system" | "user" | "assistant";
export interface LlmMessage { role: LlmRole; content: string }

export interface LlmCascadeOptions {
  system?: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  stage?: string;            // for logging
  /** Pin a single provider; skip the rest. */
  preferProvider?: CloudProvider | "ollama";
  /** Call the provider even while it is benched — the provider manager's health check. */
  ignoreBench?: boolean;
  /** Unattended work: yields providers that recently failed to interactive chat. */
  background?: boolean;
  /** Force JSON-only response */
  jsonMode?: boolean;
}

export interface LlmCascadeResult {
  text: string;
  provider: string;
  model: string;
  attempts: { provider: string; model: string; ok: boolean; status?: number; reason?: string; retryAfterMs?: number }[];
}


const OPENAI_BASE    = "https://api.openai.com/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";
const GROK_BASE      = "https://api.x.ai/v1";
const GROQ_BASE      = "https://api.groq.com/openai/v1";
const CEREBRAS_BASE  = "https://api.cerebras.ai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MISTRAL_BASE   = "https://api.mistral.ai/v1";
// A user's own Ollama (their Mac, through a tunnel) wins over the deployment's.
const ollamaBase = () => (currentOwnKeys()?.ollama || process.env.OLLAMA_BASE || "http://localhost:11434").replace(/\/$/, "");

// Vercel env-var names are case-sensitive; we also strip BOM/zero-width chars
// because Powershell-piped values sometimes inject them.
const clean = (s?: string) =>
  (s ?? "").replace(/[​‎‏﻿]/g, "").trim();

// A signed-in user's own keys (Settings → AI providers) come before the
// deployment's, so their requests run on their own quota first.
function loadKeys() {
  const own = currentOwnKeys();
  return {
    openai:    [own?.openai, process.env.OPENAI_API_KEY, process.env.OPENAI_API_KEY_2, process.env.OPENAI_API_KEY_3].map(clean).filter(Boolean),
    anthropic: clean(own?.anthropic) || clean(process.env.ANTHROPIC_API_KEY),
    gemini:    clean(own?.gemini) || clean(process.env.GEMINI_API_KEY) || clean(process.env.GOOGLE_API_KEY),
    grok:      clean(process.env.XAI_API_KEY),
    groq:      clean(own?.groq) || clean(process.env.GROQ_API_KEY),
    cerebras:  clean(own?.cerebras) || clean(process.env.CEREBRAS_API_KEY),
    openrouter: clean(own?.openrouter) || clean(process.env.OPENROUTER_API_KEY),
    mistral:   clean(own?.mistral) || clean(process.env.MISTRAL_API_KEY),
    ollama:    !!own?.ollama || process.env.OLLAMA_ENABLED === "1",
  };
}

// A user's own key has its own quota, so it is benched apart from the
// deployment's key for the same provider.
function healthName(provider: string): string {
  const own = currentOwnKeys();
  const base = provider === "gemini-lite" ? "gemini" : provider;
  return own?.[base as keyof typeof own] ? `${provider}@${own.userId}` : provider;
}

// One model per provider, each overridable by env (ANTHROPIC_MODEL, GEMINI_MODEL,
// …): when a provider retires a model every call to it 404s, and with every
// provider on a retired model the whole cascade fails — that should be a
// settings change, not a code release.
const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-5-5",
  gemini: "gemini-2.5-flash",
  geminiPro: "gemini-2.5-pro",
  grok: "grok-2-latest",
  groq: "openai/gpt-oss-120b",
  cerebras: "gpt-oss-120b",
  mistral: "mistral-small-latest",
  openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
  ollama: "llama3.1:8b",
} as const;
type ModelProvider = keyof typeof DEFAULT_MODELS;
const MODEL_ENV: Record<ModelProvider, string> = {
  openai: "OPENAI_MODEL", anthropic: "ANTHROPIC_MODEL", gemini: "GEMINI_MODEL", geminiPro: "GEMINI_PRO_MODEL", grok: "XAI_MODEL",
  groq: "GROQ_MODEL", cerebras: "CEREBRAS_MODEL", mistral: "MISTRAL_MODEL", openrouter: "OPENROUTER_MODEL", ollama: "OLLAMA_MODEL",
};
export function modelFor(provider: ModelProvider): string {
  return process.env[MODEL_ENV[provider]]?.trim() || DEFAULT_MODELS[provider];
}

// Providers retire models and every call to a retired one fails, which with every
// fallback on a retired model takes chat down entirely. When a provider says the
// model is gone, ask it which models it serves now and switch this instance to
// the best match. MODEL env vars still win; this only covers a stale default.
const MODEL_PREFS: Record<string, RegExp[]> = {
  groq: [/gpt-oss-120b/, /qwen3\.\d+-27b/, /kimi-k2/, /gpt-oss-20b/],
  cerebras: [/gpt-oss-120b/, /qwen-3/, /zai-glm/],
  openrouter: [/nemotron-3-super.*:free$/, /gemma-4-31b.*:free$/, /nemotron-3-ultra.*:free$/, /gpt-oss.*:free$/, /deepseek.*:free$/, /qwen.*:free$/, /:free$/],
  "gemini-lite": [/^gemini-[\d.]+-flash-lite$/, /^gemini-flash-lite-latest$/, /flash-lite/],
  mistral: [/^mistral-small-latest$/, /^mistral-medium-latest$/, /^mistral-large-latest$/],
  grok: [/^grok-3-mini$/, /^grok-3$/, /^grok-4/, /grok/],
};
const NOT_CHAT = /whisper|guard|tts|embed|moderation|playai|orpheus|compound|distil|audio|image|vision-preview/i;
const RETIRED = /does not exist|not found|model_not_found|unavailable for free|decommissioned|no longer (supported|available)|not a valid model|invalid model/i;
const liveModels = new Map<string, string>();

// Gemini's free quota is counted per model, so Flash-Lite and 2.0 Flash keep
// answering after 2.5 Flash's daily allowance is gone. It runs as its own
// provider, "gemini-lite", so a quota bench on one doesn't bench the other.
const GEMINI_OPENAI_BASE = `${GEMINI_BASE}/openai`;
const GEMINI_LITE_MODEL = "gemini-2.5-flash-lite";
const MAX_ALTERNATES = 3;
const MODEL_LIST_TTL_MS = 10 * 60_000;
const modelLists = new Map<string, { at: number; ids: string[] }>();

export function isRetiredModel(status: number, err: string): boolean {
  return (status === 404 || status === 400) && RETIRED.test(err);
}

// Free tiers cap tokens per minute (Groq's free gpt-oss-120b: 8K), and one chat
// request with every tool declared is bigger than that. Such a request fails
// the same way every time, so it is not a reason to bench the provider for
// everyone: remember the cap and send only requests that fit.
const TOO_LARGE = /request too large|reduce your message size|request entity too large/i;
const requestCaps = new Map<string, number>();

export function tooLargeLimit(status: number, err: string): number | null {
  if (status !== 413 && !TOO_LARGE.test(err)) return null;
  return Number(err.match(/Limit (\d+)/)?.[1] ?? 0);
}

export function estimateTokens(payload: unknown): number {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

function overCap(provider: string, tokens: number): boolean {
  const cap = requestCaps.get(provider);
  return cap !== undefined && tokens > cap;
}

function noteTooLarge(provider: string, tokens: number, limit: number) {
  requestCaps.set(provider, Math.min(requestCaps.get(provider) ?? Infinity, limit || tokens - 1, tokens - 1));
}

export function pickModel(ids: string[], prefs: RegExp[], tried: Set<string>): string | null {
  const usable = ids.filter((id) => id && !tried.has(id) && !NOT_CHAT.test(id));
  for (const p of prefs) {
    const hit = usable.find((id) => p.test(id));
    if (hit) return hit;
  }
  return null;
}

async function servedModel(provider: string, base: string, key: string, tried: Set<string>): Promise<string | null> {
  const prefs = MODEL_PREFS[provider];
  if (!prefs) return null;
  let list = modelLists.get(provider);
  if (!list || Date.now() - list.at > MODEL_LIST_TTL_MS) {
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
    if (!r?.ok) return null;
    const body = await r.json().catch(() => ({}));
    list = { at: Date.now(), ids: Array.isArray(body?.data) ? body.data.map((m: { id?: unknown }) => String(m?.id ?? "").replace(/^models\//, "")) : [] };
    modelLists.set(provider, list);
  }
  return pickModel(list.ids, prefs, tried);
}

// Free tiers rate-limit each model separately, so a 429 on one model says little
// about the next: try a few others the provider serves before giving up on it.
// A retired model is replaced for good; a rate-limited one only for this call.
async function withLiveModel<T extends { ok: boolean; status?: number }>(
  provider: string, base: string, key: string, configured: string, call: (model: string) => Promise<T>,
): Promise<{ res: T; model: string }> {
  let model = liveModels.get(provider) ?? configured;
  let res = await call(model);
  const tried = new Set([model]);
  for (let i = 0; !res.ok && i < MAX_ALTERNATES; i++) {
    const status = res.status ?? 0;
    const err = "err" in res ? String((res as { err?: unknown }).err ?? "") : "";
    const retired = isRetiredModel(status, err);
    if (tooLargeLimit(status, err) !== null) break;
    if (!retired && (status !== 429 || classifyFailure(status, err)?.status === "credit")) break;
    const next = await servedModel(provider, base, key, tried);
    if (!next) break;
    if (retired) liveModels.set(provider, next);
    tried.add(next);
    model = next;
    res = await call(model);
  }
  return { res, model };
}

const CLOUD_PROVIDERS = ["groq", "gemini-lite", "gemini", "cerebras", "openrouter", "mistral", "openai", "anthropic", "grok"] as const;
type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

// Free tiers first, ordered by daily headroom: Groq's free plan serves
// gpt-oss-120b with per-model quotas (withLiveModel rotates models on a 429);
// Flash-Lite goes before Flash so Flash's small daily quota stays free for
// images, which only the native Gemini path can read; Cerebras' trial and
// OpenRouter's :free models (50 requests a day) and Mistral follow. Paid
// providers come last, so a key without credit costs nothing until the free
// ones are exhausted. LLM_PRIMARY_PROVIDER moves one provider to the front.
export function cascadeOrder(): CloudProvider[] {
  const primary = clean(process.env.LLM_PRIMARY_PROVIDER).toLowerCase() as CloudProvider;
  return CLOUD_PROVIDERS.includes(primary) ? [primary, ...CLOUD_PROVIDERS.filter((p) => p !== primary)] : [...CLOUD_PROVIDERS];
}

/** Chat starts on native Gemini only when it is the primary or the message has media only Gemini can read. */
export function nativeGeminiFirst(hasMedia: boolean): boolean {
  return hasMedia || cascadeOrder()[0].startsWith("gemini");
}

/** Providers with a key on this deployment. */
export function configuredProviders(): string[] {
  const keys = loadKeys();
  return CLOUD_PROVIDERS.filter((p) => (p === "openai" ? keys.openai.length > 0 : p === "gemini-lite" ? !!keys.gemini : !!keys[p]));
}

export type LlmProviderState = "ok" | "quota" | "misconfigured";

/** Per-provider state for /api/health: no key or a rejected key/model is misconfigured, any other bench is quota. */
export async function llmStatus(): Promise<{ status: "ok" | "degraded" | "down"; providers: Record<string, LlmProviderState> }> {
  const configured = new Set(configuredProviders());
  const health = await healthMap();
  const providers: Record<string, LlmProviderState> = {};
  for (const p of CLOUD_PROVIDERS) {
    const h = health.get(p);
    const benched = !!h?.benched_until && new Date(h.benched_until).getTime() > Date.now();
    providers[p] = !configured.has(p) || (benched && h.status === "misconfigured") ? "misconfigured" : benched ? "quota" : "ok";
  }
  const states = [...configured].map((p) => providers[p]);
  const up = states.filter((s) => s === "ok").length + (process.env.OLLAMA_ENABLED === "1" ? 1 : 0);
  return { status: up === 0 ? "down" : up < states.length ? "degraded" : "ok", providers };
}

/**
 * The provider manager's health check: one tiny call to each configured
 * provider, past any bench, so results refresh the shared health table (a
 * success clears a bench early; a failure benches or keeps it benched).
 */
export async function probeProviders(): Promise<Array<{ provider: string; ok: boolean; model?: string; reason?: string }>> {
  const out: Array<{ provider: string; ok: boolean; model?: string; reason?: string }> = [];
  for (const p of configuredProviders() as CloudProvider[]) {
    cooldownUntil.delete(p);
    try {
      const r = await llmCascade({ preferProvider: p, ignoreBench: true, messages: [{ role: "user", content: "Reply with: OK" }], maxTokens: 8, temperature: 0, timeoutMs: 15_000 });
      out.push({ provider: p, ok: true, model: r.model });
    } catch (e) {
      const last = e instanceof LlmCascadeError ? e.attempts.at(-1) : undefined;
      out.push({ provider: p, ok: false, model: last?.model, reason: last?.reason ?? (e instanceof Error ? e.message : String(e)) });
    }
  }
  return out;
}

/** Thrown when every provider failed; carries what each one said. */
export class LlmCascadeError extends Error {
  constructor(readonly attempts: LlmCascadeResult["attempts"]) {
    super(`No AI provider could answer (${summarizeAttempts(attempts)}).`);
  }
}

/**
 * "anthropic 404 model not found · gemini 429 quota or rate limit" — what to fix,
 * in one line. Only a category per status: provider error bodies can echo part
 * of the key or account details, so they stay in the server log.
 */
export function summarizeAttempts(attempts: LlmCascadeResult["attempts"]): string {
  if (!attempts.length) return "no AI provider key is configured";
  return attempts.map((a) => `${a.provider}${a.status ? ` ${a.status}` : ""} ${failureKind(a)}`).join(" · ");
}

function failureKind(a: LlmCascadeResult["attempts"][number]): string {
  if (a.reason?.startsWith("skipped:")) return "cooling down after a quota error";
  const s = a.status ?? 0;
  if (s === 401 || s === 403) return "key rejected";
  if (s === 404) return "model not found";
  if (s === 402 || s === 429 || /quota|billing|credit/i.test(a.reason ?? "")) return "quota or rate limit";
  if (s === 0) return "unreachable or timed out";
  if (s >= 500) return "provider error";
  return "request refused";
}

/**
 * What to tell the person waiting on a chat reply when every provider failed.
 * An empty balance does not clear in a minute; a 429 does. `insufficient_quota`
 * matches both shapes, so credit exhaustion wins and is never described as a
 * short wait.
 */
export function userFacingOutage(raw: string): string {
  const outOfCredit = /credit balance|insufficient_quota|\bbilling\b|payment required/i.test(raw);
  const rateLimited = /rate.?limit|RESOURCE_EXHAUSTED|\b429\b|quota|exceeded/i.test(raw);
  const overloaded = /\b503\b|UNAVAILABLE|overloaded/i.test(raw);
  if (outOfCredit) return "I'm temporarily unable to respond right now. Please try again in a little while.";
  if (rateLimited) return "I'm getting a lot of requests right now and need a moment to catch up. Please try again in about a minute.";
  if (overloaded) return "I'm at capacity right now. This should clear on its own within a minute or two, so please try again shortly.";
  return "Something went wrong on my end. Please try again in a moment.";
}

/** The user-facing reason a generation failed: which provider said what, not "all unavailable". */
export function generationFailure(e: unknown): string {
  if (e instanceof LlmCascadeError) return `No AI provider answered: ${summarizeAttempts(e.attempts)}.`;
  return "Generation failed. Please try again.";
}

/** One plain sentence for a person when the cascade failed; never a stack trace or a provider body. */
export function userFacingLlmError(e: unknown): string {
  const raw = e instanceof LlmCascadeError
    ? e.attempts.map((a) => `${a.status ?? ""} ${a.reason ?? ""}`).join(" ")
    : e instanceof Error ? e.message : "";
  return userFacingOutage(raw);
}

// How long the provider asked us to wait: the retry-after header (seconds or
// an HTTP date, sent by Groq and Anthropic on a 429), else Gemini's
// RetryInfo retryDelay in the error body.
export function retryAfterMs(headers: Headers | undefined, body: string): number | undefined {
  const h = headers?.get("retry-after");
  if (h) {
    const secs = Number(h);
    const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(h) - Date.now();
    if (ms > 0) return ms;
  }
  const delay = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1];
  return delay ? Number(delay) * 1000 : undefined;
}

async function failed(r: Response) {
  const err = await r.text().catch(() => "");
  return { ok: false as const, status: r.status, err, quota: isQuotaError(r.status, err), retryAfterMs: retryAfterMs(r.headers, err) };
}

type CallResult = { ok: true; text: string } | { ok: false; status: number; err: string; retryAfterMs?: number };

function attempt(provider: string, model: string, res: CallResult): LlmCascadeResult["attempts"][number] {
  return res.ok
    ? { provider, model, ok: true, status: 200 }
    : { provider, model, ok: false, status: res.status, reason: res.err.slice(0, 120), retryAfterMs: res.retryAfterMs };
}

function isQuotaError(status: number, body: string): boolean {
  if (status === 429 || status === 402) return true;
  // OpenAI / Anthropic both return 400 with billing language when out of credit
  if (status === 400 && /insufficient_quota|billing|credit|quota/i.test(body)) return true;
  return false;
}

// Per-provider cooldown: once a provider comes back quota-exhausted, skip it
// on later calls in this warm instance instead of paying for another failed
// round-trip (or, for a provider that hangs rather than fast-fails, another
// full timeout) before falling through to the next one. Module-level state
// only lives as long as the serverless instance stays warm — a cold start
// clears it, which is fine, since the cooldown is an optimization, not a
// correctness requirement.
const COOLDOWN_MS = 60_000;
const cooldownUntil = new Map<string, number>();

function inCooldown(provider: string): boolean {
  const until = cooldownUntil.get(provider);
  return until !== undefined && Date.now() < until;
}

// A provider's own retry-after wins over the default when it sent one.
function startCooldown(provider: string, retryAfter?: number): void {
  cooldownUntil.set(provider, Date.now() + (retryAfter ?? COOLDOWN_MS));
}

/** Test-only: clear cooldown state between test cases. */
export function resetCooldowns(): void {
  cooldownUntil.clear();
}

const MAX_TIMEOUT_MS = 120_000;

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  // Bound the duration: timeoutMs can originate from the request body, so an
  // unclamped value would let a caller schedule an arbitrarily long timer.
  const bounded = Math.min(Math.max(0, Number(ms) || 0), MAX_TIMEOUT_MS);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), bounded);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

// ─── Per-provider calls ──────────────────────────────────────────────────

async function callOpenAI(key: string, model: string, opts: LlmCascadeOptions) {
  const { signal, clear } = withTimeout(opts.timeoutMs ?? 30_000);
  try {
    const messages = [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      ...opts.messages,
    ];
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 2000,
        temperature: opts.temperature ?? 0.7,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal,
    });
    if (!r.ok) {
      return failed(r);
    }
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return { ok: true as const, text, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false, retryAfterMs: undefined as number | undefined };
  } finally { clear(); }
}

async function callAnthropic(key: string, model: string, opts: LlmCascadeOptions) {
  const { signal, clear } = withTimeout(opts.timeoutMs ?? 30_000);
  try {
    const userContent = opts.messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");
    const system = (opts.jsonMode
      ? `${opts.system ?? ""}\n\nCRITICAL: Return ONLY valid JSON. Start with { end with }. No fences, no commentary.`
      : opts.system) || undefined;
    const r = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: opts.maxTokens ?? 2000, temperature: opts.temperature ?? 0.7,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: userContent }],
      }),
      signal,
    });
    if (!r.ok) {
      return failed(r);
    }
    const data = await r.json();
    const text = data.content?.[0]?.text ?? "";
    return { ok: true as const, text, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false, retryAfterMs: undefined as number | undefined };
  } finally { clear(); }
}

async function callGemini(key: string, model: string, opts: LlmCascadeOptions) {
  const { signal, clear } = withTimeout(Math.round((opts.timeoutMs ?? 30_000) * 1.3));
  try {
    const combined =
      (opts.system ? opts.system + "\n\n---\nUSER REQUEST:\n" : "") +
      opts.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    const r = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: combined }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.7,
            maxOutputTokens: opts.maxTokens ?? 2000,
            ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal,
      },
    );
    if (!r.ok) {
      return failed(r);
    }
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return { ok: true as const, text, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false, retryAfterMs: undefined as number | undefined };
  } finally { clear(); }
}

// OpenAI-compatible: xAI, Groq, Cerebras
async function callOpenAICompatible(base: string, key: string, model: string, opts: LlmCascadeOptions) {
  const { signal, clear } = withTimeout(opts.timeoutMs ?? 30_000);
  try {
    const messages = [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      ...opts.messages,
    ];
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, messages,
        max_tokens: opts.maxTokens ?? 2000,
        temperature: opts.temperature ?? 0.7,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal,
    });
    if (!r.ok) {
      return failed(r);
    }
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return { ok: true as const, text, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false, retryAfterMs: undefined as number | undefined };
  } finally { clear(); }
}

async function callOllama(model: string, opts: LlmCascadeOptions) {
  const { signal, clear } = withTimeout(opts.timeoutMs ?? 60_000);
  try {
    const r = await fetch(`${ollamaBase()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          ...(opts.system ? [{ role: "system", content: opts.system }] : []),
          ...opts.messages,
        ],
        stream: false,
        options: { temperature: opts.temperature ?? 0.7, num_predict: opts.maxTokens ?? 2000 },
      }),
      signal,
    });
    if (!r.ok) {
      return { ...(await failed(r)), quota: false };
    }
    const data = await r.json();
    return { ok: true as const, text: data.message?.content ?? "", model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false, retryAfterMs: undefined as number | undefined };
  } finally { clear(); }
}

// ─── Cascade entrypoint ──────────────────────────────────────────────────

// Unattended work (Gmail scan, log sync) never spends paid credit.
const PAID = new Set<CloudProvider>(["openai", "anthropic", "grok"]);

export async function llmCascade(opts: LlmCascadeOptions): Promise<LlmCascadeResult> {
  const keys = loadKeys();
  const attempts: LlmCascadeResult["attempts"] = [];
  const pref = opts.preferProvider;

  const order: (CloudProvider | "ollama")[] = pref ? [pref]
    : opts.background ? ["ollama", ...cascadeOrder().filter((p) => !PAID.has(p))] : [...cascadeOrder(), "ollama"];
  const tokens = estimateTokens([opts.system, opts.messages]);

  for (const provider of order) {
    if (overCap(provider, tokens)) {
      attempts.push({ provider, model: "-", ok: false, reason: "skipped: request larger than its per-minute token cap" });
      continue;
    }
    // A provider that just failed on quota grounds is certain to fail again
    // within the cooldown window — skip the round-trip (or, worse, a full
    // hang-and-timeout) entirely rather than pay for a call we already know
    // the answer to.
    const hp = healthName(provider);
    const benched = provider === "ollama" || opts.ignoreBench ? null : inCooldown(hp) ? "cooling down after a recent quota error"
      : (await benchedReason(hp)) ?? (opts.background ? await backgroundBlocked(hp) : null);
    if (benched) {
      attempts.push({ provider, model: "-", ok: false, reason: `skipped: ${benched}` });
      continue;
    }
    const before = attempts.length;
    if (provider === "openai" && keys.openai.length > 0) {
      for (const key of keys.openai) {
        const model = modelFor("openai");
        const res = await callOpenAI(key, model, opts);
        attempts.push(attempt("openai", model, res));
        if (res.ok) { await noteSuccess(healthName("openai"), model); return { text: res.text, provider: "openai", model, attempts }; }
        if (!res.quota) break; // non-quota error → try next provider, not next key
        startCooldown(healthName("openai"), res.retryAfterMs);
      }
    } else if (provider === "anthropic" && keys.anthropic) {
      const model = modelFor("anthropic");
      const res = await callAnthropic(keys.anthropic, model, opts);
      attempts.push(attempt("anthropic", model, res));
      if (res.ok) { await noteSuccess(healthName("anthropic"), model); return { text: res.text, provider: "anthropic", model, attempts }; }
      if (res.quota) startCooldown(healthName("anthropic"), res.retryAfterMs);
    } else if (provider === "gemini" && keys.gemini) {
      const model = modelFor("gemini");
      const res = await callGemini(keys.gemini, model, opts);
      attempts.push(attempt("gemini", model, res));
      if (res.ok) { await noteSuccess(healthName("gemini"), model); return { text: res.text, provider: "gemini", model, attempts }; }
      if (res.quota) startCooldown(healthName("gemini"), res.retryAfterMs);
    } else if (provider === "gemini-lite" && keys.gemini) {
      const { res, model } = await withLiveModel("gemini-lite", GEMINI_OPENAI_BASE, keys.gemini, GEMINI_LITE_MODEL, (m) => callGemini(keys.gemini, m, opts));
      attempts.push(attempt("gemini-lite", model, res));
      if (res.ok) { await noteSuccess(healthName("gemini-lite"), model); return { text: res.text, provider: "gemini-lite", model, attempts }; }
      if (res.quota) startCooldown(healthName("gemini-lite"), res.retryAfterMs);
    } else if (provider === "grok" && keys.grok) {
      const { res, model } = await withLiveModel("grok", GROK_BASE, keys.grok, modelFor("grok"), (m) => callOpenAICompatible(GROK_BASE, keys.grok, m, opts));
      attempts.push(attempt("grok", model, res));
      if (res.ok) { await noteSuccess(healthName("grok"), model); return { text: res.text, provider: "grok", model, attempts }; }
      if (res.quota) startCooldown(healthName("grok"), res.retryAfterMs);
    } else if (provider === "groq" && keys.groq) {
      const { res, model } = await withLiveModel("groq", GROQ_BASE, keys.groq, modelFor("groq"), (m) => callOpenAICompatible(GROQ_BASE, keys.groq, m, opts));
      attempts.push(attempt("groq", model, res));
      if (res.ok) { await noteSuccess(healthName("groq"), model); return { text: res.text, provider: "groq", model, attempts }; }
      if (res.quota) startCooldown(healthName("groq"), res.retryAfterMs);
    } else if (provider === "cerebras" && keys.cerebras) {
      const { res, model } = await withLiveModel("cerebras", CEREBRAS_BASE, keys.cerebras, modelFor("cerebras"), (m) => callOpenAICompatible(CEREBRAS_BASE, keys.cerebras, m, opts));
      attempts.push(attempt("cerebras", model, res));
      if (res.ok) { await noteSuccess(healthName("cerebras"), model); return { text: res.text, provider: "cerebras", model, attempts }; }
      if (res.quota) startCooldown(healthName("cerebras"), res.retryAfterMs);
    } else if (provider === "openrouter" && keys.openrouter) {
      const { res, model } = await withLiveModel("openrouter", OPENROUTER_BASE, keys.openrouter, modelFor("openrouter"), (m) => callOpenAICompatible(OPENROUTER_BASE, keys.openrouter, m, opts));
      attempts.push(attempt("openrouter", model, res));
      if (res.ok) { await noteSuccess(healthName("openrouter"), model); return { text: res.text, provider: "openrouter", model, attempts }; }
      if (res.quota) startCooldown(healthName("openrouter"), res.retryAfterMs);
    } else if (provider === "mistral" && keys.mistral) {
      const { res, model } = await withLiveModel("mistral", MISTRAL_BASE, keys.mistral, modelFor("mistral"), (m) => callOpenAICompatible(MISTRAL_BASE, keys.mistral, m, opts));
      attempts.push(attempt("mistral", model, res));
      if (res.ok) { await noteSuccess(healthName("mistral"), model); return { text: res.text, provider: "mistral", model, attempts }; }
      if (res.quota) startCooldown(healthName("mistral"), res.retryAfterMs);
    } else if (provider === "ollama" && keys.ollama) {
      const model = modelFor("ollama");
      const res = await callOllama(model, opts);
      attempts.push(attempt("ollama", model, res));
      if (res.ok) { await noteSuccess(healthName("ollama"), model); return { text: res.text, provider: "ollama", model, attempts }; }
    }
    for (const a of attempts.slice(before)) {
      if (a.ok || !a.status) continue;
      const limit = tooLargeLimit(a.status, a.reason ?? "");
      if (limit !== null) noteTooLarge(a.provider, tokens, limit);
      else await noteFailure(healthName(a.provider), a.model, a.status, a.reason ?? "", a.retryAfterMs);
    }
  }

  throw new LlmCascadeError(attempts);
}

// ─── Vision cascade (multimodal image → text) ────────────────────────────
// Same fall-through philosophy as llmCascade, for image analysis. Order:
// Gemini → OpenAI (gpt-4o-mini) → OpenRouter (free vision model). Any provider
// whose key is present and not quota-exhausted answers; only if all fail do we
// throw. Keeps E.D.I.T.H. vision working when the primary provider is down.
export interface VisionCascadeOptions {
  image: { mimeType: string; data: string }; // data = base64 (no data: prefix)
  prompt: string;
  system?: string;
  maxTokens?: number;
  timeoutMs?: number;
}
export interface VisionCascadeResult { text: string; provider: string; model: string }

async function visionGemini(key: string, model: string, o: VisionCascadeOptions) {
  const { signal, clear } = withTimeout(Math.round((o.timeoutMs ?? 30_000) * 1.3));
  try {
    const r = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({
        ...(o.system ? { system_instruction: { parts: [{ text: o.system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: o.prompt }, { inlineData: { mimeType: o.image.mimeType, data: o.image.data } }] }],
        generationConfig: { maxOutputTokens: o.maxTokens ?? 1200 },
      }),
    });
    if (!r.ok) return failed(r);
    const d = await r.json();
    return { ok: true as const, text: d.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "" };
  } catch (e) { return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false, retryAfterMs: undefined as number | undefined }; }
  finally { clear(); }
}

async function visionOpenAICompatible(base: string, key: string, model: string, o: VisionCascadeOptions) {
  const { signal, clear } = withTimeout(o.timeoutMs ?? 30_000);
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal,
      body: JSON.stringify({
        model, max_tokens: o.maxTokens ?? 1200,
        messages: [
          ...(o.system ? [{ role: "system", content: o.system }] : []),
          { role: "user", content: [
            { type: "text", text: o.prompt },
            { type: "image_url", image_url: { url: `data:${o.image.mimeType};base64,${o.image.data}` } },
          ] },
        ],
      }),
    });
    if (!r.ok) return failed(r);
    const d = await r.json();
    return { ok: true as const, text: d.choices?.[0]?.message?.content ?? "" };
  } catch (e) { return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false, retryAfterMs: undefined as number | undefined }; }
  finally { clear(); }
}

export async function visionCascade(o: VisionCascadeOptions): Promise<VisionCascadeResult> {
  const keys = loadKeys();
  const errors: string[] = [];
  if (keys.gemini) {
    const model = modelFor("gemini");
    const res = await visionGemini(keys.gemini, model, o);
    if (res.ok) return { text: res.text, provider: "gemini", model };
    errors.push(`gemini:${res.status}`);
  }
  for (const key of keys.openai) {
    const res = await visionOpenAICompatible(OPENAI_BASE, key, "gpt-4o-mini", o);
    if (res.ok) return { text: res.text, provider: "openai", model: "gpt-4o-mini" };
    errors.push(`openai:${res.status}`);
    if (!res.quota) break;
  }
  if (keys.openrouter) {
    const model = process.env.OPENROUTER_VISION_MODEL || "meta-llama/llama-3.2-11b-vision-instruct:free";
    const res = await visionOpenAICompatible(OPENROUTER_BASE, keys.openrouter, model, o);
    if (res.ok) return { text: res.text, provider: "openrouter", model };
    errors.push(`openrouter:${res.status}`);
  }
  throw new Error(`All vision providers failed (${errors.join(", ") || "no keys configured"}).`);
}

// ─── Tool-calling fallback cascade ────────────────────────────────────────
// When the primary Gemini tool-calling path fails (most often a free-tier
// 429), the plain-text llmCascade above can't perform any action — it has no
// tools at all. That left live actions (send an email, add a task, open an
// app) completely dead for as long as Gemini stayed rate-limited, even with
// several other provider keys configured. Groq, Cerebras and Mistral all
// speak the same OpenAI-compatible function-calling wire format, so this
// gives the chat route a real, tool-capable fallback to try before it gives
// up and degrades to text-only mode.
export interface OpenAIToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export type OpenAIChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolCallCascadeOptions {
  messages: OpenAIChatMessage[];
  tools: any[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}
export interface ToolCallCascadeResult {
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  provider: string;
  model: string;
}

async function callOpenAICompatibleTools(base: string, key: string, model: string, opts: ToolCallCascadeOptions) {
  const { signal, clear } = withTimeout(opts.timeoutMs ?? 30_000);
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: "auto",
        max_tokens: opts.maxTokens ?? 2000,
        temperature: opts.temperature ?? 0.7,
      }),
      signal,
    });
    if (!r.ok) {
      return failed(r);
    }
    const data = await r.json();
    const msg = data.choices?.[0]?.message ?? {};
    return { ok: true as const, content: (msg.content as string | null) ?? null, tool_calls: msg.tool_calls as OpenAIToolCall[] | undefined, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false, retryAfterMs: undefined as number | undefined };
  } finally { clear(); }
}

// OpenAI-compatible tool callers, sorted by cascadeOrder (free tiers first).
function toolCapableOrder(): { provider: string; base: string; model: string; key: string }[] {
  const keys = loadKeys();
  const rows: { provider: string; base: string; model: string; key: string }[] = [];
  if (keys.openai[0]) rows.push({ provider: "openai", base: OPENAI_BASE, model: modelFor("openai"), key: keys.openai[0] });
  // Anthropic's OpenAI-compatible endpoint takes the same tools payload.
  if (keys.anthropic) rows.push({ provider: "anthropic", base: ANTHROPIC_BASE, model: modelFor("anthropic"), key: keys.anthropic });
  if (keys.gemini) {
    rows.push({ provider: "gemini-lite", base: GEMINI_OPENAI_BASE, model: GEMINI_LITE_MODEL, key: keys.gemini });
    rows.push({ provider: "gemini", base: GEMINI_OPENAI_BASE, model: modelFor("gemini"), key: keys.gemini });
  }
  if (keys.groq) rows.push({ provider: "groq", base: GROQ_BASE, model: modelFor("groq"), key: keys.groq });
  if (keys.cerebras) rows.push({ provider: "cerebras", base: CEREBRAS_BASE, model: modelFor("cerebras"), key: keys.cerebras });
  if (keys.mistral) rows.push({ provider: "mistral", base: MISTRAL_BASE, model: modelFor("mistral"), key: keys.mistral });
  if (keys.grok) rows.push({ provider: "grok", base: GROK_BASE, model: modelFor("grok"), key: keys.grok });
  if (keys.openrouter) rows.push({ provider: "openrouter", base: OPENROUTER_BASE, model: modelFor("openrouter"), key: keys.openrouter });
  const rank = cascadeOrder();
  return rows.sort((a, b) => rank.indexOf(a.provider as CloudProvider) - rank.indexOf(b.provider as CloudProvider));
}

export async function toolCallCascade(opts: ToolCallCascadeOptions): Promise<ToolCallCascadeResult> {
  const attempts: string[] = [];
  const tokens = estimateTokens([opts.messages, opts.tools]);
  for (const { provider, base, model, key } of toolCapableOrder()) {
    const hp = healthName(provider);
    const benched = overCap(provider, tokens) ? "request larger than its token cap" : inCooldown(hp) ? "cooling down" : await benchedReason(hp);
    if (benched) { attempts.push(`${provider}:${benched}`); continue; }
    const { res, model: used } = await withLiveModel(provider, base, key, model, (m) => callOpenAICompatibleTools(base, key, m, opts));
    if (res.ok) {
      await noteSuccess(hp, used);
      return { content: res.content, tool_calls: res.tool_calls, provider, model: used };
    }
    const limit = tooLargeLimit(res.status, res.err);
    if (limit !== null) { noteTooLarge(provider, tokens, limit); attempts.push(`${provider}:too large`); continue; }
    await noteFailure(hp, used, res.status, res.err, res.retryAfterMs);
    attempts.push(`${provider}:${res.status}`);
    if (res.quota) startCooldown(hp, res.retryAfterMs);
  }
  throw new Error(`All tool-capable fallback providers failed. Attempts: ${attempts.join(", ") || "no keys configured"}`);
}

// Gemini function declarations use uppercase JSON-schema type names (OBJECT,
// STRING, ...); OpenAI-compatible tool schemas need them lowercase. Recurses
// into nested `properties`/`items` so nested object/array parameters convert
// too.
export function geminiToolsToOpenAI(
  functionDeclarations: { name: string; description?: string; parameters?: any }[],
): any[] {
  const lowerTypes = (schema: any): any => {
    if (!schema || typeof schema !== "object") return schema;
    if (Array.isArray(schema)) return schema.map(lowerTypes);
    const out: any = {};
    for (const [k, v] of Object.entries(schema)) {
      out[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : lowerTypes(v);
    }
    return out;
  };
  return functionDeclarations.map((fd) => ({
    type: "function",
    function: {
      name: fd.name,
      description: fd.description,
      parameters: lowerTypes(fd.parameters ?? { type: "OBJECT", properties: {} }),
    },
  }));
}

// ─── Transcription cascade (audio → text) ────────────────────────────────
// Groq Whisper (free, fast) → OpenAI Whisper. Both are OpenAI-compatible
// multipart endpoints, so the same request shape works for each.
export interface TranscribeCascadeResult { text: string; provider: string; model: string }

function transcriptionFile(audio: Blob): { file: File; mime: string } {
  const t = (audio.type || "").toLowerCase();
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return { file: new File([audio], "audio.mp4", { type: "audio/mp4" }), mime: "audio/mp4" };
  if (t.includes("wav")) return { file: new File([audio], "audio.wav", { type: "audio/wav" }), mime: "audio/wav" };
  if (t.includes("mpeg") || t.includes("mp3")) return { file: new File([audio], "audio.mp3", { type: "audio/mpeg" }), mime: "audio/mpeg" };
  if (t.includes("ogg")) return { file: new File([audio], "audio.ogg", { type: "audio/ogg" }), mime: "audio/ogg" };
  return { file: new File([audio], "audio.webm", { type: "audio/webm" }), mime: "audio/webm" };
}

async function transcribeOne(base: string, key: string, model: string, audio: Blob, lang?: string, timeoutMs = 30_000): Promise<{ ok: boolean; text?: string; status?: number; quota?: boolean }> {
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const fd = new FormData();
    fd.append("file", transcriptionFile(audio).file);
    fd.append("model", model);
    if (lang) fd.append("language", lang.split("-")[0]);
    fd.append("response_format", "text");
    const r = await fetch(`${base}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal });
    if (!r.ok) { const err = await r.text().catch(() => ""); return { ok: false, status: r.status, quota: isQuotaError(r.status, err) }; }
    const body = await r.text();
    // response_format=text returns raw text; some gateways still wrap it in JSON.
    let text = body;
    try { const j = JSON.parse(body); if (j && typeof j.text === "string") text = j.text; } catch { /* raw text */ }
    return { ok: true, text: text.trim() };
  } catch { return { ok: false, status: 0 }; }
  finally { clear(); }
}

export async function geminiGroundedSearch(query: string): Promise<string | null> {
  const key = usableGeminiKey();
  const q = query.trim();
  if (!key || !q) return null;
  const { signal, clear } = withTimeout(20_000);
  try {
    const r = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(modelFor("gemini"))}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Answer from a web search. Include the source URLs you used. Query: ${q}` }] }],
        tools: [{ google_search: {} }],
      }),
      signal,
    });
    if (!r.ok) return null;
    const data = await r.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p.text ?? "").join("\n").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clear();
  }
}

async function transcribeGemini(key: string, audio: Blob, lang?: string): Promise<{ ok: boolean; text?: string; status?: number }> {
  const { signal, clear } = withTimeout(30_000);
  try {
    const buf = Buffer.from(await audio.arrayBuffer());
    if (buf.length < 400) return { ok: false, status: 0 };
    const prompt = lang
      ? `Transcribe this audio (${lang}). Return only the transcript.`
      : "Transcribe this audio. Return only the transcript.";
    const r = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(modelFor("gemini"))}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: transcriptionFile(audio).mime, data: buf.toString("base64") } },
          ],
        }],
      }),
      signal,
    });
    if (!r.ok) return { ok: false, status: r.status };
    const data = await r.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p.text ?? "").join("\n").trim();
    return text ? { ok: true, text } : { ok: false, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clear();
  }
}

// What Whisper reliably "hears" in silence or room noise — subtitle credits from
// its training data. Alone in a clip they are never what the user said.
const HALLUCINATIONS = new Set([
  "thank you", "thank you very much", "thanks", "thanks for watching", "thank you for watching",
  "thank you so much for watching", "please subscribe", "subscribe", "bye", "you", "okay", "so",
  "subtitles by the amara.org community", "transcribed by https://otter.ai",
]);

export function isHallucination(text: string): boolean {
  const t = text.toLowerCase().replace(/[^\p{L}\p{N}\s.:/-]/gu, "").replace(/[.\s]+$/, "").trim();
  return !t || HALLUCINATIONS.has(t);
}

export async function transcribeCascade(audio: Blob, lang?: string): Promise<TranscribeCascadeResult> {
  const keys = loadKeys();
  const errors: string[] = [];
  if (keys.groq) {
    const res = await transcribeOne(GROQ_BASE, keys.groq, "whisper-large-v3", audio, lang);
    if (res.ok) return { text: res.text ?? "", provider: "groq", model: "whisper-large-v3" };
    errors.push(`groq:${res.status}`);
  }
  for (const key of keys.openai) {
    const res = await transcribeOne(OPENAI_BASE, key, "whisper-1", audio, lang);
    if (res.ok) return { text: res.text ?? "", provider: "openai", model: "whisper-1" };
    errors.push(`openai:${res.status}`);
    if (!res.quota) break;
  }
  const gemini = usableGeminiKey();
  if (gemini) {
    const res = await transcribeGemini(gemini, audio, lang);
    if (res.ok) return { text: res.text ?? "", provider: "gemini", model: modelFor("gemini") };
    errors.push(`gemini:${res.status}`);
  }
  throw new Error(`All transcription providers failed (${errors.join(", ") || "no keys configured"}).`);
}
