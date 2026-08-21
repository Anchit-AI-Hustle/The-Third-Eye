import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { llmCascade, resetCooldowns } from "@/lib/llmCascade";

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
      { match: (u) => u.includes("generativelanguage.googleapis.com"), status: 429, body: { error: { message: "RESOURCE_EXHAUSTED" } } },
      { match: (u) => u.includes("api.groq.com"), status: 200, body: { choices: [{ message: { content: "groq answer" } }] } },
    ]);

    const first = await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    expect(first.provider).toBe("groq");
    const geminiCallsAfterFirst = calls.filter((u) => u.includes("generativelanguage.googleapis.com")).length;
    expect(geminiCallsAfterFirst).toBe(1);

    const second = await llmCascade({ messages: [{ role: "user", content: "hi again" }] });
    expect(second.provider).toBe("groq");
    // Still just the one Gemini call from before — the second run skipped it
    // via the cooldown instead of hitting the (still-429) endpoint again.
    const geminiCallsAfterSecond = calls.filter((u) => u.includes("generativelanguage.googleapis.com")).length;
    expect(geminiCallsAfterSecond).toBe(1);

    const geminiAttempt = second.attempts.find((a) => a.provider === "gemini");
    expect(geminiAttempt?.reason).toMatch(/cooling down/);
  });

  it("retries a provider again once the cooldown is cleared", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GROQ_API_KEY = "test-groq-key";

    const { calls } = fetchStub([
      { match: (u) => u.includes("generativelanguage.googleapis.com"), status: 429, body: { error: { message: "RESOURCE_EXHAUSTED" } } },
      { match: (u) => u.includes("api.groq.com"), status: 200, body: { choices: [{ message: { content: "groq answer" } }] } },
    ]);

    await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    resetCooldowns();
    await llmCascade({ messages: [{ role: "user", content: "hi again" }] });

    const geminiCalls = calls.filter((u) => u.includes("generativelanguage.googleapis.com")).length;
    expect(geminiCalls).toBe(2);
  });

  it("does not cool down a provider for a non-quota failure", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GROQ_API_KEY = "test-groq-key";

    const { calls } = fetchStub([
      { match: (u) => u.includes("generativelanguage.googleapis.com"), status: 500, body: { error: { message: "internal error" } } },
      { match: (u) => u.includes("api.groq.com"), status: 200, body: { choices: [{ message: { content: "groq answer" } }] } },
    ]);

    await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    await llmCascade({ messages: [{ role: "user", content: "hi again" }] });

    // A 500 isn't a quota error, so no cooldown — Gemini gets tried both times.
    const geminiCalls = calls.filter((u) => u.includes("generativelanguage.googleapis.com")).length;
    expect(geminiCalls).toBe(2);
  });
});
