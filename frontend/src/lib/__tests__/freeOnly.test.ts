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

  it("keeps only OpenRouter (:free models) by default; paid and unconfirmed providers are gone", async () => {
    const { cascadeOrder, configuredProviders } = await import("@/lib/llmCascade");
    const cfg = configuredProviders();
    expect(cfg).toEqual(["openrouter"]);
    for (const p of [...PAID, "groq", "cerebras", "gemini", "gemini-lite", "mistral", "huggingface"]) expect(cascadeOrder()).not.toContain(p);
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

  it("calls only openrouter.ai on a full text cascade, tool cascade, vision and transcription", async () => {
    const hosts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { hosts.push(new URL(String(url)).host); return new Response(JSON.stringify({ error: "x" }), { status: 500 }); }));
    const m = await import("@/lib/llmCascade");
    await m.llmCascade({ messages: [{ role: "user", content: "hi" }] } as never).catch(() => null);
    await m.toolCallCascade({ messages: [{ role: "user", content: "hi" }], tools: [] } as never).catch(() => null);
    await m.visionCascade({ prompt: "x", image: { mimeType: "image/png", data: "AAAA" } }).catch(() => null);
    await m.transcribeCascade(new Blob(["abc"], { type: "audio/webm" })).catch(() => null);
    const allowed = new Set(["openrouter.ai"]);
    expect(hosts.length).toBeGreaterThan(0);
    for (const h of hosts) expect(allowed.has(h), h).toBe(true);
  });

  it("refuses a non-:free OpenRouter model (env override or rotation) without a request", async () => {
    process.env.OPENROUTER_MODEL = "openai/gpt-4o";
    process.env.OPENROUTER_VISION_MODEL = "openai/gpt-4o";
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { if (String(url).includes("openrouter.ai") && init?.body) bodies.push(String(init.body)); return new Response("{}", { status: 500 }); }));
    const m = await import("@/lib/llmCascade");
    await m.llmCascade({ preferProvider: "openrouter", messages: [{ role: "user", content: "hi" }] } as never).catch(() => null);
    await m.visionCascade({ prompt: "x", image: { mimeType: "image/png", data: "AAAA" } }).catch(() => null);
    for (const b of bodies) expect(b).not.toContain("gpt-4o");
    // Positive control: with the default :free vision model the same path does call OpenRouter.
    delete process.env.OPENROUTER_VISION_MODEL;
    await m.visionCascade({ prompt: "x", image: { mimeType: "image/png", data: "AAAA" } }).catch(() => null);
    expect(bodies.some((b) => b.includes(":free"))).toBe(true);
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
