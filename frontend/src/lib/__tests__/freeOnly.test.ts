import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV = {
  OPENAI_API_KEY: "sk-test-openai", XAI_API_KEY: "xai-test", ANTHROPIC_API_KEY: "sk-ant-test",
  OPENROUTER_API_KEY: "or-test", GROQ_API_KEY: "gq-test", CEREBRAS_API_KEY: "cb-test",
  MISTRAL_API_KEY: "mi-test", HF_TOKEN: "hf-test", GEMINI_API_KEY: "AIza-test-gemini-key-0000000000000000",
  REPLICATE_API_TOKEN: "r8-test", ELEVENLABS_API_KEY: "sk_test_eleven",
  RAZORPAY_KEY_ID: "rzp_test", RAZORPAY_KEY_SECRET: "secret", STRIPE_SECRET_KEY: "sk_test_x",
};
const PAID = ["openrouter-paid", "anthropic", "openai", "grok"];

describe("free-only guard (default)", () => {
  const saved = { ...process.env };
  beforeEach(() => { vi.resetModules(); Object.assign(process.env, ENV); delete process.env.PAID_PATH_TESTS; delete process.env.FREE_TIER_CONFIRMED; delete process.env.LLM_PRIMARY_PROVIDER; });
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

  it("has no env switch that turns it off", async () => {
    process.env.ALLOW_PAID_PROVIDERS = "1";
    const { freeOnly } = await import("@/lib/freeOnly");
    expect(freeOnly()).toBe(true);
  });

  it("has no cloud provider by default: OpenRouter is owner-excluded, paid and unconfirmed providers are gone", async () => {
    const { cascadeOrder, configuredProviders } = await import("@/lib/llmCascade");
    const cfg = configuredProviders();
    expect(cfg).toEqual([]);
    for (const p of [...PAID, "groq", "cerebras", "gemini", "gemini-lite", "mistral", "huggingface", "openrouter"]) expect(cascadeOrder()).not.toContain(p);
  });

  it("FREE_TIER_CONFIRMED re-enables only the named providers, never a paid one", async () => {
    process.env.FREE_TIER_CONFIRMED = "gemini, mistral, groq, anthropic, openai";
    const { configuredProviders } = await import("@/lib/llmCascade");
    const cfg = configuredProviders();
    expect(cfg).toContain("gemini"); expect(cfg).toContain("gemini-lite"); expect(cfg).toContain("mistral"); expect(cfg).toContain("groq");
    expect(cfg).not.toContain("huggingface"); expect(cfg).not.toContain("cerebras");
    for (const p of PAID) expect(cfg).not.toContain(p);
  });

  it("LLM_PRIMARY_PROVIDER cannot pull a blocked provider to the front", async () => {
    process.env.LLM_PRIMARY_PROVIDER = "anthropic";
    const { cascadeOrder } = await import("@/lib/llmCascade");
    expect(cascadeOrder()).not.toContain("anthropic");
  });

  it("makes no network call for a blocked preferProvider", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { llmCascade } = await import("@/lib/llmCascade");
    for (const p of [...PAID, "gemini", "mistral", "huggingface"])
      await expect(llmCascade({ preferProvider: p, messages: [{ role: "user", content: "hi" }] } as never)).rejects.toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with only groq confirmed, calls only api.groq.com on text, tool, vision and transcription paths (OpenRouter key present, unused)", async () => {
    process.env.FREE_TIER_CONFIRMED = "groq";
    const hosts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { hosts.push(new URL(String(url)).host); return new Response(JSON.stringify({ error: "x" }), { status: 500 }); }));
    const m = await import("@/lib/llmCascade");
    await m.llmCascade({ messages: [{ role: "user", content: "hi" }] } as never).catch(() => null);
    await m.toolCallCascade({ messages: [{ role: "user", content: "hi" }], tools: [] } as never).catch(() => null);
    await m.visionCascade({ prompt: "x", image: { mimeType: "image/png", data: "AAAA" } }).catch(() => null);
    await m.transcribeCascade(new Blob(["abc"], { type: "audio/webm" })).catch(() => null);
    const allowed = new Set(["api.groq.com"]);
    expect(hosts.length).toBeGreaterThan(0);
    for (const h of hosts) expect(allowed.has(h), h).toBe(true);
  });

  it("never contacts OpenRouter, even with a :free model, a preferred provider or the key present", async () => {
    process.env.FREE_TIER_CONFIRMED = "groq";
    const hosts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { hosts.push(new URL(String(url)).host); return new Response("{}", { status: 500 }); }));
    const m = await import("@/lib/llmCascade");
    await m.llmCascade({ preferProvider: "openrouter", messages: [{ role: "user", content: "hi" }] } as never).catch(() => null);
    await m.llmCascade({ messages: [{ role: "user", content: "hi" }] } as never).catch(() => null);
    await m.visionCascade({ prompt: "x", image: { mimeType: "image/png", data: "AAAA" } }).catch(() => null);
    expect(hosts).not.toContain("openrouter.ai");
  });

  it("turns off embeddings, the Claude post generator, Replicate, ElevenLabs, Razorpay and Stripe", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await (await import("@/lib/cortex/embed")).embed("hello")).toBeNull();
    expect((await import("@/lib/cortex/embed")).cortexEnabled()).toBe(false);
    expect((await import("@/lib/replicate")).replicateConfigured()).toBe(false);
    expect((await import("@/lib/music/elevenlabs")).elevenLabsConfigured()).toBe(false);
    expect((await import("@/lib/razorpay")).razorpayReady()).toBe(false);
    expect((await import("@/lib/stripe")).getStripe()).toBeNull();
    expect((await import("@/lib/providerReady")).usableGeminiKey()).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("serper gate", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; vi.resetModules(); });
  it("keeps the Serper key off until the owner confirms it", async () => {
    delete process.env.PAID_PATH_TESTS; delete process.env.FREE_TIER_CONFIRMED;
    const m = await import("@/lib/freeOnly");
    expect(m.gatedKey("serper", "k")).toBe("");
    process.env.FREE_TIER_CONFIRMED = "serper";
    expect(m.gatedKey("serper", "k")).toBe("k");
  });
});
