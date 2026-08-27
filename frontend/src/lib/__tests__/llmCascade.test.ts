import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { geminiToolsToOpenAI, llmCascade, resetCooldowns, toolCallCascade } from "@/lib/llmCascade";

// A provider that just failed on quota grounds should be skipped on the next
// call within the cooldown window, instead of paying for another failed
// round-trip (or a full timeout, for a provider that hangs rather than
// fast-fails) before falling through the cascade to a working one.

const ENV_KEYS = [
  "OPENAI_API_KEY", "OPENAI_API_KEY_2", "OPENAI_API_KEY_3", "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY", "GROQ_API_KEY",
  "CEREBRAS_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY", "OLLAMA_ENABLED",
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
  it("skips a recently-quota-exhausted provider on the next call, without a new fetch", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GROQ_API_KEY = "test-groq-key";

    const { calls } = fetchStub([
      { match: (u) => hostIs(u, GEMINI_HOST), status: 429, body: { error: { message: "RESOURCE_EXHAUSTED" } } },
      { match: (u) => hostIs(u, GROQ_HOST), status: 200, body: { choices: [{ message: { content: "groq answer" } }] } },
    ]);

    const first = await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    expect(first.provider).toBe("groq");
    const geminiCallsAfterFirst = calls.filter((u) => hostIs(u, GEMINI_HOST)).length;
    expect(geminiCallsAfterFirst).toBe(1);

    const second = await llmCascade({ messages: [{ role: "user", content: "hi again" }] });
    expect(second.provider).toBe("groq");
    // Still just the one Gemini call from before — the second run skipped it
    // via the cooldown instead of hitting the (still-429) endpoint again.
    const geminiCallsAfterSecond = calls.filter((u) => hostIs(u, GEMINI_HOST)).length;
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

    const geminiCalls = calls.filter((u) => hostIs(u, GEMINI_HOST)).length;
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
    const geminiCalls = calls.filter((u) => hostIs(u, GEMINI_HOST)).length;
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
