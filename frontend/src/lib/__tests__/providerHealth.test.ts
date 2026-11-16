import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let table: Record<string, Record<string, unknown>> = {};
let dbDown = false;
const quota = { message: "Your account or project has exceeded the quota.", code: "53000" };
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    from: () => ({
      select: async () => (dbDown ? { data: null, error: quota } : { data: Object.values(table) }),
      upsert: async (row: Record<string, unknown>) => { if (dbDown) return { error: quota }; table[row.provider as string] = row; return { error: null }; },
    }),
  }),
}));

beforeEach(async () => {
  table = {};
  dbDown = false;
  const h = await import("@/lib/providerHealth");
  h.resetHealthCache();
  h.forgetSeenHealth();
});

describe("with the database down", () => {
  it("still shows what this server just saw, so a re-check isn't lost", async () => {
    dbDown = true;
    const { noteFailure, noteSuccess, healthMap, resetHealthCache, benchedReason } = await import("@/lib/providerHealth");
    await noteSuccess("groq", "openai/gpt-oss-120b");
    await noteFailure("cerebras", "m", 429, "You exceeded your current quota");
    resetHealthCache();
    const rows = await healthMap();
    expect(rows.get("groq")).toMatchObject({ status: "ok", model: "openai/gpt-oss-120b" });
    expect(await benchedReason("cerebras")).toMatch(/quota until/);
  });

  it("prefers the database's row when it is newer than this server's", async () => {
    const { noteSuccess, healthMap, resetHealthCache } = await import("@/lib/providerHealth");
    await noteSuccess("groq", "old-model");
    table.groq = { provider: "groq", status: "rate_limited", model: "old-model", reason: "429", benched_until: new Date(Date.now() + 60_000).toISOString(), checked_at: new Date(Date.now() + 1000).toISOString() };
    resetHealthCache();
    expect((await healthMap()).get("groq")?.status).toBe("rate_limited");
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("classifying provider failures", () => {
  it("benches by how long the problem lasts", async () => {
    const { classifyFailure } = await import("@/lib/providerHealth");
    expect(classifyFailure(402, "Payment required to access this resource. Visit your billing tab.")?.status).toBe("credit");
    expect(classifyFailure(400, "Your credit balance is too low to access the Anthropic API")?.status).toBe("credit");
    expect(classifyFailure(429, "You exceeded your current quota, please check your plan")?.status).toBe("quota");
    expect(classifyFailure(429, "Rate limit reached for model `openai/gpt-oss-120b`")).toMatchObject({ status: "rate_limited", ms: 120_000 });
    expect(classifyFailure(404, "model does not exist")?.status).toBe("misconfigured");
    expect(classifyFailure(401, "Invalid API Key")?.status).toBe("misconfigured");
    expect(classifyFailure(500, "internal")).toBeNull();
  });
});

describe("shared bench across instances", () => {
  it("skips a benched provider without calling it, and clears the bench on success", async () => {
    const { noteFailure, noteSuccess, benchedReason } = await import("@/lib/providerHealth");
    await noteFailure("groq", "m", 429, "Rate limit reached");
    expect(await benchedReason("groq")).toMatch(/rate limited until/);
    await noteSuccess("groq", "m");
    expect(await benchedReason("groq")).toBeNull();
  });

  it("the tool-calling fallback skips a provider another instance benched", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("MISTRAL_API_KEY", "k2");
    table.groq = { provider: "groq", status: "credit", model: "x", reason: "credit", benched_until: new Date(Date.now() + 3_600_000).toISOString(), checked_at: new Date().toISOString() };
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    }));
    vi.resetModules();
    const { toolCallCascade } = await import("@/lib/llmCascade");
    const out = await toolCallCascade({ messages: [{ role: "user", content: "hi" }], tools: [] });
    expect(out.provider).toBe("mistral");
    expect(urls.some((u) => u.includes("groq"))).toBe(false);
  });

  it("keeps background work off a provider for 15 minutes after its bench ends, leaving it for chat", async () => {
    const { backgroundBlocked, benchedReason } = await import("@/lib/providerHealth");
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    table.groq = { provider: "groq", status: "rate_limited", model: "m", reason: "429", benched_until: ago(1), checked_at: ago(3) };
    table.mistral = { provider: "mistral", status: "rate_limited", model: "m", reason: "429", benched_until: ago(16), checked_at: ago(18) };
    table.openrouter = { provider: "openrouter", status: "ok", model: "m", reason: null, benched_until: null, checked_at: ago(0) };
    expect(await benchedReason("groq")).toBeNull();
    expect(await backgroundBlocked("groq")).toMatch(/free for chat/);
    expect(await backgroundBlocked("mistral")).toBeNull();
    expect(await backgroundBlocked("openrouter")).toBeNull();
  });
});
