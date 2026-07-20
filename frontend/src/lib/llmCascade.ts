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
  preferProvider?: "openai" | "anthropic" | "gemini" | "grok" | "groq" | "cerebras" | "openrouter" | "mistral" | "ollama";
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
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MISTRAL_BASE   = "https://api.mistral.ai/v1";
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
    openrouter: clean(process.env.OPENROUTER_API_KEY),
    mistral:   clean(process.env.MISTRAL_API_KEY),
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

  const order: ("openai" | "anthropic" | "gemini" | "grok" | "groq" | "cerebras" | "openrouter" | "mistral" | "ollama")[] =
    pref ? [pref] : ["openai", "anthropic", "gemini", "grok", "groq", "cerebras", "openrouter", "mistral", "ollama"];

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
    } else if (provider === "openrouter" && keys.openrouter) {
      const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
      const res = await callOpenAICompatible(OPENROUTER_BASE, keys.openrouter, model, opts);
      attempts.push({ provider: "openrouter", model, ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "openrouter", model, attempts };
    } else if (provider === "mistral" && keys.mistral) {
      const res = await callOpenAICompatible(MISTRAL_BASE, keys.mistral, "mistral-small-latest", opts);
      attempts.push({ provider: "mistral", model: "mistral-small-latest", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "mistral", model: "mistral-small-latest", attempts };
    } else if (provider === "ollama" && keys.ollama) {
      const res = await callOllama("llama3.1:8b", opts);
      attempts.push({ provider: "ollama", model: "llama3.1:8b", ok: res.ok, status: res.ok ? 200 : res.status, reason: res.ok ? undefined : ("err" in res ? res.err.slice(0, 120) : undefined) });
      if (res.ok) return { text: res.text, provider: "ollama", model: "llama3.1:8b", attempts };
    }
  }

  throw new Error(`All ${order.length} LLM provider(s) failed. Attempts: ${JSON.stringify(attempts)}`);
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
    if (!r.ok) { const err = await r.text().catch(() => ""); return { ok: false as const, status: r.status, err, quota: isQuotaError(r.status, err) }; }
    const d = await r.json();
    return { ok: true as const, text: d.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "" };
  } catch (e) { return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false }; }
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
    if (!r.ok) { const err = await r.text().catch(() => ""); return { ok: false as const, status: r.status, err, quota: isQuotaError(r.status, err) }; }
    const d = await r.json();
    return { ok: true as const, text: d.choices?.[0]?.message?.content ?? "" };
  } catch (e) { return { ok: false as const, status: 0, err: e instanceof Error ? e.message : String(e), quota: false }; }
  finally { clear(); }
}

export async function visionCascade(o: VisionCascadeOptions): Promise<VisionCascadeResult> {
  const keys = loadKeys();
  const errors: string[] = [];
  if (keys.gemini) {
    const res = await visionGemini(keys.gemini, "gemini-2.5-flash", o);
    if (res.ok) return { text: res.text, provider: "gemini", model: "gemini-2.5-flash" };
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

// ─── Transcription cascade (audio → text) ────────────────────────────────
// Groq Whisper (free, fast) → OpenAI Whisper. Both are OpenAI-compatible
// multipart endpoints, so the same request shape works for each.
export interface TranscribeCascadeResult { text: string; provider: string; model: string }

async function transcribeOne(base: string, key: string, model: string, audio: Blob, lang?: string, timeoutMs = 30_000): Promise<{ ok: boolean; text?: string; status?: number; quota?: boolean }> {
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const fd = new FormData();
    fd.append("file", new File([audio], "audio.webm", { type: audio.type || "audio/webm" }));
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
  throw new Error(`All transcription providers failed (${errors.join(", ") || "no keys configured"}).`);
}
