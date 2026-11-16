import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generationFailure, geminiToolsToOpenAI, llmCascade, resetCooldowns, toolCallCascade, userFacingOutage } from "@/lib/llmCascade";

// A provider that just failed on quota grounds should be skipped on the next
// call within the cooldown window, instead of paying for another failed
// round-trip (or a full timeout, for a provider that hangs rather than
// fast-fails) before falling through the cascade to a working one.

const ENV_KEYS = [
  "OPENAI_API_KEY", "OPENAI_API_KEY_2", "OPENAI_API_KEY_3", "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY", "GROQ_API_KEY",
  "CEREBRAS_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "FREE_TIER_CONFIRMED", "OPENROUTER_API_KEY", "MISTRAL_API_KEY", "OLLAMA_ENABLED", "LLM_PRIMARY_PROVIDER",
];

function clearKeys() {
  for (const k of ENV_KEYS) delete process.env[k];
}

// Exact hostname match via URL parsing, not substring matching — a substring
// check on a raw URL string can false-positive on an attacker- or
// coincidentally-controlled path/query containing the same text elsewhere in
// the string (flagged by CodeQL: incomplete URL substring sanitization).
function hostIs(url: string, host: string): boolean {
  try { return new URL(url).hostname === host; } catch { return false; }
}
const GEMINI_HOST = "generativelanguage.googleapis.com";
const GROQ_HOST = "api.groq.com";

beforeEach(() => {
  clearKeys();
  resetCooldowns();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearKeys();
  resetCooldowns();
});

function fetchStub(handlers: { match: (url: string) => boolean; status: number; body: unknown }[]) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    const h = handlers.find((h) => h.match(url));
    if (!h) throw new Error(`unhandled url: ${url}`);
    return {
      ok: h.status < 400,
      status: h.status,
      json: async () => h.body,
      text: async () => JSON.stringify(h.body),
    };
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

describe("llmCascade: per-provider cooldown after a quota error", () => {
  // Gemini goes first here so its failure is what the cooldown acts on.
  beforeEach(() => { process.env.LLM_PRIMARY_PROVIDER = "gemini"; });

  it("skips a recently-quota-exhausted provider on the next call, without a new fetch", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GROQ_API_KEY = "test-groq-key";

    const { calls } = fetchStub([
      { match: (u) => hostIs(u, GEMINI_HOST), status: 429, body: { error: { message: "RESOURCE_EXHAUSTED" } } },
      { match: (u) => hostIs(u, GROQ_HOST), status: 200, body: { choices: [{ message: { content: "groq answer" } }] } },
    ]);

    const first = await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    expect(first.provider).toBe("groq");
    const geminiCallsAfterFirst = calls.filter((u) => hostIs(u, GEMINI_HOST) && u.includes("gemini-2.5-flash:")).length;
    expect(geminiCallsAfterFirst).toBe(1);

    const second = await llmCascade({ messages: [{ role: "user", content: "hi again" }] });
    expect(second.provider).toBe("groq");
    // Still just the one Gemini call from before — the second run skipped it
    // via the cooldown instead of hitting the (still-429) endpoint again.
    const geminiCallsAfterSecond = calls.filter((u) => hostIs(u, GEMINI_HOST) && u.includes("gemini-2.5-flash:")).length;
    expect(geminiCallsAfterSecond).toBe(1);

    const geminiAttempt = second.attempts.find((a) => a.provider === "gemini");
    expect(geminiAttempt?.reason).toMatch(/cooling down/);
  });

  it("retries a provider again once the cooldown is cleared", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GROQ_API_KEY = "test-groq-key";

    const { calls } = fetchStub([
      { match: (u) => hostIs(u, GEMINI_HOST), status: 429, body: { error: { message: "RESOURCE_EXHAUSTED" } } },
      { match: (u) => hostIs(u, GROQ_HOST), status: 200, body: { choices: [{ message: { content: "groq answer" } }] } },
    ]);

    await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    resetCooldowns();
    await llmCascade({ messages: [{ role: "user", content: "hi again" }] });

    const geminiCalls = calls.filter((u) => hostIs(u, GEMINI_HOST) && u.includes("gemini-2.5-flash:")).length;
    expect(geminiCalls).toBe(2);
  });

  it("does not cool down a provider for a non-quota failure", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GROQ_API_KEY = "test-groq-key";

    const { calls } = fetchStub([
      { match: (u) => hostIs(u, GEMINI_HOST), status: 500, body: { error: { message: "internal error" } } },
      { match: (u) => hostIs(u, GROQ_HOST), status: 200, body: { choices: [{ message: { content: "groq answer" } }] } },
    ]);

    await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    await llmCascade({ messages: [{ role: "user", content: "hi again" }] });

    // A 500 isn't a quota error, so no cooldown — Gemini gets tried both times.
    const geminiCalls = calls.filter((u) => hostIs(u, GEMINI_HOST) && u.includes("gemini-2.5-flash:")).length;
    expect(geminiCalls).toBe(2);
  });
});

describe("geminiToolsToOpenAI: converts Gemini function declarations to OpenAI tool schema", () => {
  it("lowercases nested JSON-schema type names and preserves structure", () => {
    const openAiTools = geminiToolsToOpenAI([
      {
        name: "manage_tasks",
        description: "Unified task manager",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["create", "update"] },
            tags: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["action"],
        },
      },
    ]);

    expect(openAiTools).toEqual([
      {
        type: "function",
        function: {
          name: "manage_tasks",
          description: "Unified task manager",
          parameters: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["create", "update"] },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["action"],
          },
        },
      },
    ]);
  });
});

describe("toolCallCascade: tool-capable fallback (Groq/Cerebras/Mistral)", () => {
  it("returns tool_calls from the first provider with a key, so live actions keep working when Gemini is down", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";

    fetchStub([
      {
        match: (u) => hostIs(u, GROQ_HOST),
        status: 200,
        body: { choices: [{ message: { content: null, tool_calls: [{ id: "1", type: "function", function: { name: "manage_tasks", arguments: "{\"action\":\"search\"}" } }] } }] },
      },
    ]);

    const out = await toolCallCascade({
      messages: [{ role: "user", content: "show my tasks" }],
      tools: geminiToolsToOpenAI([{ name: "manage_tasks", parameters: { type: "OBJECT", properties: {} } }]),
    });

    expect(out.provider).toBe("groq");
    expect(out.tool_calls?.[0]?.function.name).toBe("manage_tasks");
  });

  it("falls through to the next tool-capable provider on a quota error", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.CEREBRAS_API_KEY = "test-cerebras-key";

    fetchStub([
      { match: (u) => hostIs(u, GROQ_HOST), status: 429, body: { error: "rate limited" } },
      { match: (u) => hostIs(u, "api.cerebras.ai"), status: 200, body: { choices: [{ message: { content: "done" } }] } },
    ]);

    const out = await toolCallCascade({ messages: [{ role: "user", content: "hi" }], tools: [] });
    expect(out.provider).toBe("cerebras");
    expect(out.content).toBe("done");
  });

  it("throws when no tool-capable provider is configured", async () => {
    await expect(toolCallCascade({ messages: [{ role: "user", content: "hi" }], tools: [] })).rejects.toThrow(/no key/);
  });
});

describe("userFacingOutage", () => {
  it("separates a rejected key (401) from a permission refusal (403) and ignores quota errors", () => {
    expect(userFacingOutage("401 invalid_api_key")).toMatch(/did not accept its API key.*fresh one/);
    expect(userFacingOutage("403 forbidden")).toMatch(/refused the request.*not necessarily an expired key/);
    expect(userFacingOutage("401 key rejected 429 rate limit")).not.toMatch(/API key/);
  });
  it("does not tell someone an empty balance will clear in a couple of minutes", () => {
    const raw = "openai 429 insufficient_quota billing | gemini RESOURCE_EXHAUSTED";
    expect(userFacingOutage(raw)).toBe("The configured AI providers are out of credits or need billing attention. Check the provider keys and billing settings, then try again.");
    expect(userFacingOutage(raw)).not.toMatch(/couple of minutes/);
  });

  it("when every free limit is used up, says when the first one resets, in the person's time", () => {
    const raw = "groq  skipped: cooling down after a recent quota error gemini-lite  skipped: quota until 04:27 UTC gemini  skipped: quota until 23:59 UTC";
    const now = new Date("2026-10-18T03:54:00Z");
    expect(userFacingOutage(raw, "Asia/Kolkata", now)).toBe("My free AI limits are used up for now. The first one resets at about 9:57 AM. Please try again then.");
    expect(userFacingOutage(raw, "UTC", new Date("2026-10-18T05:00:00Z"))).toMatch(/at about 11:59 PM/);
  });

  it("treats a plain rate limit as a short wait", () => {
    expect(userFacingOutage("RESOURCE_EXHAUSTED 429")).toMatch(/about a minute/);
  });
});

describe("llmCascade: when every provider fails", () => {
  afterEach(() => { delete process.env.GEMINI_MODEL; });

  it("says which provider failed and why, instead of 'all providers unavailable'", async () => {
    process.env.GEMINI_API_KEY = "k1";
    process.env.GROQ_API_KEY = "k2";
    fetchStub([
      { match: (u) => hostIs(u, GEMINI_HOST), status: 404, body: { error: { message: "models/gemini-x is not found" } } },
      { match: (u) => hostIs(u, GROQ_HOST), status: 401, body: { error: { message: "Invalid API Key" } } },
    ]);
    const err = await llmCascade({ messages: [{ role: "user", content: "hi" }] }).catch((e) => e);
    const msg = generationFailure(err);
    expect(msg).toContain("gemini 404 model not found");
    expect(msg).toContain("groq 401 key rejected");
    // Provider bodies can echo part of the key; only the category reaches the user.
    expect(msg).not.toContain("Invalid API Key");
    expect(msg).not.toContain("gemini-x");
  });

  it("uses the model named in the environment, so a retired model is a settings change", async () => {
    process.env.GEMINI_API_KEY = "k1";
    process.env.GEMINI_MODEL = "gemini-flash-latest";
    const { calls } = fetchStub([{ match: (u) => hostIs(u, GEMINI_HOST), status: 200, body: { candidates: [{ content: { parts: [{ text: "ok" }] } }] } }]);
    const out = await llmCascade({ preferProvider: "gemini", messages: [{ role: "user", content: "hi" }] });
    expect(calls[0]).toContain("/models/gemini-flash-latest:");
    expect(out.model).toBe("gemini-flash-latest");
  });

  it("says so when no provider key is configured at all", async () => {
    const err = await llmCascade({ messages: [{ role: "user", content: "hi" }] }).catch((e) => e);
    expect(generationFailure(err)).toContain("no AI provider key is configured");
  });
});

describe("llmCascade: Cloudflare Workers AI backup (free-only gate)", () => {
  const ID = "0123456789abcdef0123456789abcdef";
  const CF = "api.cloudflare.com";
  beforeEach(() => { process.env.PAID_PATH_TESTS = "0"; }); // free-only guard ON
  afterEach(() => { process.env.PAID_PATH_TESTS = "1"; });

  it("is never called without FREE_TIER_CONFIRMED, even with an account id and token", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ID; process.env.CLOUDFLARE_API_TOKEN = "cf-synthetic";
    const { calls } = fetchStub([{ match: (u) => hostIs(u, CF), status: 200, body: { choices: [{ message: { content: "cf" } }] } }]);
    await expect(llmCascade({ messages: [{ role: "user", content: "hi" }] })).rejects.toBeTruthy();
    expect(calls.length).toBe(0);
  });

  it("ignores a CLOUDFLARE_MODEL that is not on the verified free list and never swaps models on 404", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ID; process.env.CLOUDFLARE_API_TOKEN = "cf-synthetic"; process.env.FREE_TIER_CONFIRMED = "cloudflare";
    process.env.CLOUDFLARE_MODEL = "@cf/moonshotai/kimi-k2.6";
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }): Promise<any> => { bodies.push(`${url} ${init?.body ?? ""}`); return { ok: false, status: 404, json: async () => ({}), text: async () => "{}" }; }));
    await expect(llmCascade({ messages: [{ role: "user", content: "hi" }] })).rejects.toBeTruthy();
    expect(bodies.every((b) => !b.includes("kimi"))).toBe(true);
    expect(bodies.some((b) => b.includes("@cf/zai-org/glm-4.7-flash"))).toBe(true);
    expect(bodies.length).toBe(1); // no /models lookup, no retry on another model
    delete process.env.CLOUDFLARE_MODEL;
  });

  it("is rejected when the account id is not 32 hex characters", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "../evil"; process.env.CLOUDFLARE_API_TOKEN = "cf-synthetic"; process.env.FREE_TIER_CONFIRMED = "cloudflare";
    const { calls } = fetchStub([{ match: () => true, status: 200, body: { choices: [{ message: { content: "x" } }] } }]);
    await expect(llmCascade({ messages: [{ role: "user", content: "hi" }] })).rejects.toBeTruthy();
    expect(calls.length).toBe(0);
  });

  it("answers as the backup when Groq is out of quota, on the account's own URL", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ID; process.env.CLOUDFLARE_API_TOKEN = "cf-synthetic";
    process.env.GROQ_API_KEY = "test-groq-key"; process.env.FREE_TIER_CONFIRMED = "groq,cloudflare";
    const { calls } = fetchStub([
      { match: (u) => hostIs(u, GROQ_HOST), status: 429, body: { error: { message: "Rate limit reached. Please try again in 1h2m3s" } } },
      { match: (u) => hostIs(u, CF), status: 200, body: { choices: [{ message: { content: "cf answer" } }] } },
    ]);
    const r = await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    expect(r.provider).toBe("cloudflare");
    expect(calls.some((u) => u.startsWith(`https://api.cloudflare.com/client/v4/accounts/${ID}/ai/v1/`))).toBe(true);
    // Groq is now benched: the next call does not hit it again.
    const groqBefore = calls.filter((u) => hostIs(u, GROQ_HOST)).length;
    const r2 = await llmCascade({ messages: [{ role: "user", content: "again" }] });
    expect(r2.provider).toBe("cloudflare");
    expect(calls.filter((u) => hostIs(u, GROQ_HOST)).length).toBe(groqBefore);
  });
});

describe("toolCallCascade: one reply's rejected models and call allowance", () => {
  const chatBody = (init?: { body?: string }) => JSON.parse(init?.body ?? "{}");
  function stub(rejectModel: string) {
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }): Promise<any> => {
      if (url.endsWith("/models")) return { ok: true, status: 200, json: async () => ({ data: [{ id: "openai/gpt-oss-120b" }, { id: "qwen/qwen3.8-27b" }] }), text: async () => "{}" };
      const m = chatBody(init).model as string;
      sent.push(m);
      if (m === rejectModel) return { ok: false, status: 429, json: async () => ({ error: { message: "Rate limit reached for model" } }), text: async (): Promise<string> => "{}" };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok", tool_calls: [] } }] }), text: async () => "{}" };
    }));
    return sent;
  }
  const msgs = [{ role: "user" as const, content: "hi" }];

  it("does not send a model that already returned 429 earlier in the same reply", async () => {
    process.env.GROQ_API_KEY = "test-groq-key"; process.env.FREE_TIER_CONFIRMED = "groq"; process.env.PAID_PATH_TESTS = "0";
    const sent = stub("openai/gpt-oss-120b");
    const rejected = new Set<string>(); const budget = { left: 8 };
    await toolCallCascade({ messages: msgs, tools: [], rejected, budget });
    expect(sent).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
    expect(rejected.has("groq:openai/gpt-oss-120b")).toBe(true);
    resetCooldowns();
    await toolCallCascade({ messages: msgs, tools: [], rejected, budget });
    expect(sent).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "qwen/qwen3.8-27b"]); // 120b not sent again
    expect(budget.left).toBe(5);
    process.env.PAID_PATH_TESTS = "1";
  });

  it("stops sending once the reply's call allowance is used", async () => {
    process.env.GROQ_API_KEY = "test-groq-key"; process.env.FREE_TIER_CONFIRMED = "groq"; process.env.PAID_PATH_TESTS = "0";
    const sent = stub("none");
    await expect(toolCallCascade({ messages: msgs, tools: [], budget: { left: 0 } })).rejects.toBeTruthy();
    expect(sent.length).toBe(0);
    process.env.PAID_PATH_TESTS = "1";
  });
});
