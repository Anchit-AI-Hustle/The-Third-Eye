// 7-provider LLM cascade — ported from marketing_mailers__html_architect/api/_shared/llm.js
//
// Order: OpenAI → Anthropic → Gemini → xAI/Grok → Groq → Cerebras → Ollama
// First provider with a non-quota-exhausted key returns. Quota / rate-limit /
// "credit balance too low" errors fall through to the next tier without
// failing the request.
//
// Use this for any LLM call where vendor-specific features (tool use, image
// gen) are NOT required. The chat assistant still uses Gemini directly for
// function calling — this cascade is for translate / multi-agent reasoning /
// other plain-text generations where any model will do.

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
  preferProvider?: "openai" | "anthropic" | "gemini" | "grok" | "groq" | "cerebras" | "ollama";
  /** Force JSON-only response */
  jsonMode?: boolean;
}

export interface LlmCascadeResult {
  text: string;
  provider: string;
  model: string;
  attempts: { provider: string; model: string; ok: boolean; status?: number; reason?: string }[];
}

const OPENAI_BASE    = "https://api.openai.com/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";
const GROK_BASE      = "https://api.x.ai/v1";
const GROQ_BASE      = "https://api.groq.com/openai/v1";
const CEREBRAS_BASE  = "https://api.cerebras.ai/v1";
const OLLAMA_BASE    = process.env.OLLAMA_BASE ?? "http://localhost:11434";

// Vercel env-var names are case-sensitive; we also strip BOM/zero-width chars
// because Powershell-piped values sometimes inject them.
const clean = (s?: string) =>
  (s ?? "").replace(/[​‎‏﻿]/g, "").trim();

function loadKeys() {
  return {
    openai:    [process.env.OPENAI_API_KEY, process.env.OPENAI_API_KEY_2, process.env.OPENAI_API_KEY_3].map(clean).filter(Boolean),
    anthropic: clean(process.env.ANTHROPIC_API_KEY),
    gemini:    clean(process.env.GEMINI_API_KEY) || clean(process.env.GOOGLE_API_KEY),
    grok:      clean(process.env.XAI_API_KEY),
    groq:      clean(process.env.GROQ_API_KEY),
    cerebras:  clean(process.env.CEREBRAS_API_KEY),
    ollama:    process.env.OLLAMA_ENABLED === "1",
  };
}

function isQuotaError(status: number, body: string): boolean {
  if (status === 429 || status === 402) return true;
  // OpenAI / Anthropic both return 400 with billing language when out of credit
  if (status === 400 && /insufficient_quota|billing|credit|quota/i.test(body)) return true;
  return false;
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
      const err = await r.text().catch(() => "");
      return { ok: false as const, status: r.status, err, quota: isQuotaError(r.status, err) };
    }
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return { ok: true as const, text, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false };
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
      const err = await r.text().catch(() => "");
      return { ok: false as const, status: r.status, err, quota: isQuotaError(r.status, err) };
    }
    const data = await r.json();
    const text = data.content?.[0]?.text ?? "";
    return { ok: true as const, text, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false };
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
      const err = await r.text().catch(() => "");
      return { ok: false as const, status: r.status, err, quota: isQuotaError(r.status, err) };
    }
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return { ok: true as const, text, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false };
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
      }),
      signal,
    });
    if (!r.ok) {
      const err = await r.text().catch(() => "");
      return { ok: false as const, status: r.status, err, quota: isQuotaError(r.status, err) };
    }
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return { ok: true as const, text, model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false };
  } finally { clear(); }
}

async function callOllama(model: string, opts: LlmCascadeOptions) {
  const { signal, clear } = withTimeout(opts.timeoutMs ?? 60_000);
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/chat`, {
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
      const err = await r.text().catch(() => "");
      return { ok: false as const, status: r.status, err, quota: false };
    }
    const data = await r.json();
    return { ok: true as const, text: data.message?.content ?? "", model };
  } catch (e) {
    return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false };
  } finally { clear(); }
}

// ─── Cascade entrypoint ──────────────────────────────────────────────────

export async function llmCascade(opts: LlmCascadeOptions): Promise<LlmCascadeResult> {
  const keys = loadKeys();
  const attempts: LlmCascadeResult["attempts"] = [];
  const pref = opts.preferProvider;

  const order: ("openai" | "anthropic" | "gemini" | "grok" | "groq" | "cerebras" | "ollama")[] =
    pref ? [pref] : ["openai", "anthropic", "gemini", "grok", "groq", "cerebras", "ollama"];

  for (const provider of order) {
    if (provider === "openai" && keys.openai.length > 0) {
      for (const key of keys.openai) {
        const res = await callOpenAI(key, "gpt-4o-mini", opts);
        attempts.push({ provider: "openai", model: "gpt-4o-mini", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
        if (res.ok) return { text: res.text, provider: "openai", model: "gpt-4o-mini", attempts };
        if (res.ok === false && !res.quota) break; // non-quota error → try next provider, not next key
      }
    } else if (provider === "anthropic" && keys.anthropic) {
      const res = await callAnthropic(keys.anthropic, "claude-3-5-haiku-latest", opts);
      attempts.push({ provider: "anthropic", model: "claude-3-5-haiku", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "anthropic", model: "claude-3-5-haiku-latest", attempts };
    } else if (provider === "gemini" && keys.gemini) {
      const res = await callGemini(keys.gemini, "gemini-2.5-flash", opts);
      attempts.push({ provider: "gemini", model: "gemini-2.5-flash", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "gemini", model: "gemini-2.5-flash", attempts };
    } else if (provider === "grok" && keys.grok) {
      const res = await callOpenAICompatible(GROK_BASE, keys.grok, "grok-2-latest", opts);
      attempts.push({ provider: "grok", model: "grok-2-latest", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "grok", model: "grok-2-latest", attempts };
    } else if (provider === "groq" && keys.groq) {
      const res = await callOpenAICompatible(GROQ_BASE, keys.groq, "llama-3.3-70b-versatile", opts);
      attempts.push({ provider: "groq", model: "llama-3.3-70b-versatile", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "groq", model: "llama-3.3-70b-versatile", attempts };
    } else if (provider === "cerebras" && keys.cerebras) {
      const res = await callOpenAICompatible(CEREBRAS_BASE, keys.cerebras, "llama-3.3-70b", opts);
      attempts.push({ provider: "cerebras", model: "llama-3.3-70b", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "cerebras", model: "llama-3.3-70b", attempts };
    } else if (provider === "ollama" && keys.ollama) {
      const res = await callOllama("llama3.1:8b", opts);
      attempts.push({ provider: "ollama", model: "llama3.1:8b", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "ollama", model: "llama3.1:8b", attempts };
    }
  }

  throw new Error(`All ${order.length} LLM provider(s) failed. Attempts: ${JSON.stringify(attempts)}`);
}
