import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Acceptance tests for the provider cascade: verified model IDs, an
// env-chosen paid provider first, fallthrough on every failure type,
// retry-after honoured, and a plain final message.

let health: Record<string, Record<string, unknown>> = {};
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    from: () => ({
      select: async () => ({ data: Object.values(health) }),
      upsert: async (row: Record<string, unknown>) => { health[row.provider as string] = row; return { error: null }; },
    }),
  }),
}));

const KEYS = ["OPENAI_API_KEY", "OPENAI_API_KEY_2", "OPENAI_API_KEY_3", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY", "GROQ_API_KEY", "CEREBRAS_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY", "OLLAMA_ENABLED", "LLM_PRIMARY_PROVIDER"];

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
let calls: { host: string; model: string; auth: string | null; path: string }[] = [];

function stubFetch(byHost: Record<string, Reply | ((model: string) => Reply)>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/models") && (!init || init.method !== "POST")) return new Response(JSON.stringify({ data: [] }));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const model = body.model ?? decodeURIComponent(u.pathname.match(/models\/([^:]+):/)?.[1] ?? "");
    calls.push({ host: u.hostname, model, auth: new Headers(init?.headers).get("authorization"), path: u.pathname });
    const spec = byHost[u.hostname];
    const r = typeof spec === "function" ? spec(model) : spec ?? { status: 500, body: "no stub" };
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }));
}

const okChat = { status: 200, body: { choices: [{ message: { content: "hi" } }] } };

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  health = {};
  calls = [];
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe("model IDs come from the providers' current lists", () => {
  it("asks Groq, Cerebras, Anthropic and OpenRouter for models they still serve", async () => {
    process.env.GROQ_API_KEY = "g"; process.env.CEREBRAS_API_KEY = "c"; process.env.ANTHROPIC_API_KEY = "a"; process.env.OPENROUTER_API_KEY = "o";
    stubFetch({ "api.anthropic.com": { status: 200, body: { content: [{ type: "text", text: "hi" }] } }, "api.groq.com": okChat, "api.cerebras.ai": okChat, "openrouter.ai": okChat });
    const { llmCascade } = await import("@/lib/llmCascade");
    for (const p of ["anthropic", "groq", "cerebras", "openrouter"] as const) await llmCascade({ preferProvider: p, messages: [{ role: "user", content: "x" }] });
    expect(calls.map((c) => c.model)).toEqual(["claude-haiku-5-5", "openai/gpt-oss-120b", "gpt-oss-120b", "nvidia/nemotron-3-super-120b-a12b:free"]);
  });
});

describe("JSON mode reaches every OpenAI-compatible provider", () => {
  it("sends response_format json_object to Groq, Cerebras, OpenRouter and Mistral", async () => {
    process.env.GROQ_API_KEY = "g"; process.env.CEREBRAS_API_KEY = "c"; process.env.OPENROUTER_API_KEY = "o"; process.env.MISTRAL_API_KEY = "m";
    const formats: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [] }));
      formats.push(JSON.parse(String(init?.body)).response_format);
      return new Response(JSON.stringify(okChat.body));
    }));
    const { llmCascade } = await import("@/lib/llmCascade");
    for (const p of ["groq", "cerebras", "openrouter", "mistral"] as const) await llmCascade({ preferProvider: p, jsonMode: true, messages: [{ role: "user", content: "x" }] });
    expect(formats).toEqual(Array(4).fill({ type: "json_object" }));
  });
});

describe("free tiers first by default", () => {
  it("orders free providers by daily headroom, paid ones last", async () => {
    const { cascadeOrder } = await import("@/lib/llmCascade");
    expect(cascadeOrder()).toEqual(["groq", "gemini-lite", "gemini", "cerebras", "openrouter", "mistral", "openai", "anthropic", "grok"]);
  });

  it("sends tool calls to Groq before any paid key, with no env var set", async () => {
    process.env.GROQ_API_KEY = "g"; process.env.ANTHROPIC_API_KEY = "sk-ant"; process.env.OPENAI_API_KEY = "sk-oai";
    stubFetch({ "api.groq.com": okChat });
    const { toolCallCascade } = await import("@/lib/llmCascade");
    const out = await toolCallCascade({ messages: [{ role: "user", content: "x" }], tools: [] });
    expect(out.provider).toBe("groq");
    expect(calls.map((c) => c.host)).toEqual(["api.groq.com"]);
  });

  it("keeps chat off native Gemini unless it is the primary or the message carries media", async () => {
    const { nativeGeminiFirst } = await import("@/lib/llmCascade");
    expect(nativeGeminiFirst(false)).toBe(false);
    expect(nativeGeminiFirst(true)).toBe(true);
    process.env.LLM_PRIMARY_PROVIDER = "gemini";
    expect(nativeGeminiFirst(false)).toBe(true);
    process.env.LLM_PRIMARY_PROVIDER = "groq";
    expect(nativeGeminiFirst(false)).toBe(false);
  });
});

describe("requests too big for a provider's free per-minute token cap", () => {
  const tooLarge = { status: 413, body: { error: { message: "Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 12345, please reduce your message size and try again." } } };
  const big = [{ role: "user" as const, content: "x".repeat(40_000) }];
  const small = [{ role: "user" as const, content: "hi" }];
  const lite = { status: 200, body: { choices: [{ message: { content: "from gemini" } }] } };

  it("go to the next provider without benching the one that refused", async () => {
    process.env.GROQ_API_KEY = "g"; process.env.GEMINI_API_KEY = "x".repeat(39);
    stubFetch({ "api.groq.com": tooLarge, "generativelanguage.googleapis.com": lite });
    const { toolCallCascade } = await import("@/lib/llmCascade");
    const out = await toolCallCascade({ messages: big, tools: [] });
    expect(out.provider).toBe("gemini-lite");
    expect(health.groq?.benched_until ?? null).toBeNull();
    expect(calls.filter((c) => c.host === "api.groq.com")).toHaveLength(1);
  });

  it("skip that provider for requests as big next time, but still use it for small ones", async () => {
    process.env.GROQ_API_KEY = "g"; process.env.GEMINI_API_KEY = "x".repeat(39);
    let groqHits = 0;
    stubFetch({ "api.groq.com": () => (groqHits++ === 0 ? tooLarge : okChat), "generativelanguage.googleapis.com": lite });
    const { toolCallCascade } = await import("@/lib/llmCascade");
    await toolCallCascade({ messages: big, tools: [] });
    calls = [];
    expect((await toolCallCascade({ messages: big, tools: [] })).provider).toBe("gemini-lite");
    expect(calls.some((c) => c.host === "api.groq.com")).toBe(false);
    expect((await toolCallCascade({ messages: small, tools: [] })).provider).toBe("groq");
  });

  it("treats a 429 that says the request is too large the same way, not as a rate limit", async () => {
    process.env.GROQ_API_KEY = "g"; process.env.GEMINI_API_KEY = "x".repeat(39);
    stubFetch({ "api.groq.com": { ...tooLarge, status: 429 }, "generativelanguage.googleapis.com": lite });
    const { llmCascade } = await import("@/lib/llmCascade");
    expect((await llmCascade({ messages: big })).provider).toBe("gemini-lite");
    expect(health.groq?.benched_until ?? null).toBeNull();
    expect(calls.filter((c) => c.host === "api.groq.com")).toHaveLength(1);
  });

  it("keeps tools working on Gemini Flash when Flash-Lite's quota is spent", async () => {
    process.env.GEMINI_API_KEY = "x".repeat(39);
    stubFetch({ "generativelanguage.googleapis.com": (m) => (m.includes("lite") ? { status: 429, body: { error: { message: "You exceeded your current quota" } } } : lite) });
    const { toolCallCascade } = await import("@/lib/llmCascade");
    const out = await toolCallCascade({ messages: small, tools: [] });
    expect(out.provider).toBe("gemini");
  });
});

describe("a provider chosen by env goes first", () => {
  it("LLM_PRIMARY_PROVIDER moves that provider to the front, the free order follows", async () => {
    process.env.LLM_PRIMARY_PROVIDER = "anthropic";
    const { cascadeOrder } = await import("@/lib/llmCascade");
    expect(cascadeOrder()).toEqual(["anthropic", "groq", "gemini-lite", "gemini", "cerebras", "openrouter", "mistral", "openai", "grok"]);
  });

  it("puts the primary first for tool calls too, Anthropic through its OpenAI-compatible endpoint", async () => {
    process.env.GROQ_API_KEY = "g"; process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.LLM_PRIMARY_PROVIDER = "anthropic";
    stubFetch({ "api.anthropic.com": okChat });
    const { toolCallCascade } = await import("@/lib/llmCascade");
    const out = await toolCallCascade({ messages: [{ role: "user", content: "x" }], tools: [] });
    expect(out.provider).toBe("anthropic");
    expect(calls[0]).toMatchObject({ host: "api.anthropic.com", path: "/v1/chat/completions", auth: "Bearer sk-ant", model: "claude-haiku-5-5" });
  });
});

describe("every failure type falls through, then one clear message", () => {
  it("tries each configured provider in order and ends with a plain sentence", async () => {
    process.env.ANTHROPIC_API_KEY = "a"; process.env.GEMINI_API_KEY = "x".repeat(39); process.env.GROQ_API_KEY = "g";
    process.env.CEREBRAS_API_KEY = "c"; process.env.OPENROUTER_API_KEY = "o"; process.env.MISTRAL_API_KEY = "m";
    stubFetch({
      "api.anthropic.com": { status: 400, body: { error: { message: "Your credit balance is too low to access the Anthropic API." } } },
      "generativelanguage.googleapis.com": { status: 429, body: { error: { message: "You exceeded your current quota" } } },
      "api.groq.com": { status: 404, body: { error: { message: "The model `openai/gpt-oss-120b` does not exist" } } },
      "api.cerebras.ai": { status: 402, body: { message: "Payment required to access this resource." } },
      "openrouter.ai": { status: 401, body: { error: { message: "No auth credentials found" } } },
      "api.mistral.ai": { status: 429, body: { message: "Rate limit exceeded" } },
    });
    const { llmCascade, LlmCascadeError, userFacingLlmError } = await import("@/lib/llmCascade");
    const err = await llmCascade({ messages: [{ role: "user", content: "x" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmCascadeError);
    expect(err.attempts.map((a: { provider: string }) => a.provider)).toEqual(["groq", "gemini-lite", "gemini", "cerebras", "openrouter", "mistral", "anthropic"]);
    const msg = userFacingLlmError(err);
    expect(msg).toMatch(/^[A-Z][^{}[\]]+\.$/);
    expect(msg).not.toMatch(/\bat \w|Error:|\{/);
    expect(err.message).not.toContain("{");
  });
});

describe("retry-after is honoured", () => {
  it("benches a rate-limited provider for as long as its retry-after header says", async () => {
    process.env.GROQ_API_KEY = "g";
    stubFetch({ "api.groq.com": { status: 429, body: { error: { message: "Rate limit reached" } }, headers: { "retry-after": "90" } } });
    const { llmCascade } = await import("@/lib/llmCascade");
    const t0 = Date.now();
    await llmCascade({ preferProvider: "groq", messages: [{ role: "user", content: "x" }] }).catch(() => {});
    const until = new Date(String(health.groq.benched_until)).getTime() - t0;
    expect(until).toBeGreaterThan(85_000);
    expect(until).toBeLessThan(100_000);
  });

  it("reads Gemini's retryDelay from the error body when there is no header", async () => {
    process.env.GEMINI_API_KEY = "x".repeat(39);
    stubFetch({ "generativelanguage.googleapis.com": { status: 429, body: { error: { message: "Too many requests", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "41s" }] } } } });
    const { llmCascade } = await import("@/lib/llmCascade");
    const t0 = Date.now();
    await llmCascade({ preferProvider: "gemini", messages: [{ role: "user", content: "x" }] }).catch(() => {});
    const until = new Date(String(health.gemini.benched_until)).getTime() - t0;
    expect(until).toBeGreaterThan(38_000);
    expect(until).toBeLessThan(50_000);
  });
});

describe("/api/health", () => {
  it("reports each provider as ok, quota or misconfigured with no secrets, and an overall state", async () => {
    process.env.GROQ_API_KEY = "gsk_secret_value"; process.env.ANTHROPIC_API_KEY = "sk-ant-secret";
    health.anthropic = { provider: "anthropic", status: "credit", model: "m", reason: "credit balance", benched_until: new Date(Date.now() + 3_600_000).toISOString(), checked_at: new Date().toISOString() };
    health.groq = { provider: "groq", status: "ok", model: "m", reason: null, benched_until: null, checked_at: new Date().toISOString() };
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const text = await res.text();
    expect(text).not.toMatch(/gsk_secret_value|sk-ant-secret/);
    const body = JSON.parse(text);
    expect(body.llm.status).toBe("degraded");
    expect(body.llm.providers.anthropic).toBe("quota");
    expect(body.llm.providers.groq).toBe("ok");
    expect(body.llm.providers.mistral).toBe("misconfigured");
  });

  it("is down when no configured provider can answer", async () => {
    process.env.GROQ_API_KEY = "g";
    health.groq = { provider: "groq", status: "rate_limited", model: "m", reason: "429", benched_until: new Date(Date.now() + 60_000).toISOString(), checked_at: new Date().toISOString() };
    const { GET } = await import("@/app/api/health/route");
    const body = await (await GET()).json();
    expect(body.llm.status).toBe("down");
  });
});
