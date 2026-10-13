import { afterEach, describe, expect, it, vi } from "vitest";
import { isRetiredModel, pickModel } from "@/lib/llmCascade";

describe("recovering from a retired model", () => {
  it("recognises the providers' retired-model errors and nothing else", () => {
    expect(isRetiredModel(404, "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.")).toBe(true);
    expect(isRetiredModel(404, '{"message":"Model does not exist or you do not have access to it."}')).toBe(true);
    expect(isRetiredModel(404, "This model is unavailable for free. The paid version is available now")).toBe(true);
    expect(isRetiredModel(429, "model does not exist")).toBe(false);
    expect(isRetiredModel(401, "invalid api key")).toBe(false);
  });

  it("picks the best chat model the provider serves now", () => {
    const groq = ["whisper-large-v3", "meta-llama/llama-guard-4-12b", "openai/gpt-oss-20b", "openai/gpt-oss-120b", "llama-3.1-8b-instant"];
    expect(pickModel(groq, [/llama-3\.3-70b/, /gpt-oss-120b/, /gpt-oss-20b/], new Set(["llama-3.3-70b-versatile"]))).toBe("openai/gpt-oss-120b");
    const or = ["openai/gpt-4o", "deepseek/deepseek-chat-v3:free", "qwen/qwen3-32b:free"];
    expect(pickModel(or, [/llama-3\.3-70b.*:free$/, /deepseek.*:free$/, /:free$/], new Set(["meta-llama/llama-3.3-70b-instruct:free"]))).toBe("deepseek/deepseek-chat-v3:free");
    expect(pickModel(["whisper-large-v3"], [/./], new Set(["x"]))).toBeNull();
  });
});

describe("toolCallCascade switches off a retired model", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

  it("lists the provider's models and retries with a served one", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
    vi.stubEnv("OPENAI_API_KEY", "");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/models")) {
        calls.push("models");
        return new Response(JSON.stringify({ data: [{ id: "whisper-large-v3" }, { id: "openai/gpt-oss-120b" }] }));
      }
      const model = JSON.parse(String(init?.body)).model;
      calls.push(model);
      if (model === "llama-3.3-70b-versatile") return new Response("The model `llama-3.3-70b-versatile` does not exist", { status: 404 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }));
    }));
    const { toolCallCascade } = await import("@/lib/llmCascade");
    const out = await toolCallCascade({ messages: [{ role: "user", content: "hello" }], tools: [] });
    expect(out).toMatchObject({ provider: "groq", model: "openai/gpt-oss-120b", content: "hi" });
    expect(calls).toEqual(["llama-3.3-70b-versatile", "models", "openai/gpt-oss-120b"]);
  });
});

describe("free-tier rate limits are per model", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

  it("tries another served model on a 429 before giving up on the provider", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "llama-3.3-70b-versatile" }, { id: "openai/gpt-oss-120b" }] }));
      const model = JSON.parse(String(init?.body)).model;
      calls.push(model);
      if (model === "llama-3.3-70b-versatile") return new Response("Rate limit reached for model `llama-3.3-70b-versatile`", { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }));
    }));
    const { llmCascade } = await import("@/lib/llmCascade");
    const out = await llmCascade({ preferProvider: "groq", messages: [{ role: "user", content: "hello" }] });
    expect(out).toMatchObject({ provider: "groq", model: "openai/gpt-oss-120b", text: "hi" });
    expect(calls).toEqual(["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]);
  });

  it("does not shop for models when the account is out of credit", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return new Response("Your credit balance is too low", { status: 429 });
    }));
    const { llmCascade } = await import("@/lib/llmCascade");
    await expect(llmCascade({ preferProvider: "groq", ignoreBench: true, messages: [{ role: "user", content: "hello" }] })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("falls back to Gemini Flash-Lite when 2.5 Flash's daily quota is spent", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    vi.stubEnv("OPENAI_API_KEY", "");
    const models: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const model = decodeURIComponent(url.match(/models\/([^:]+):/)?.[1] ?? "");
      models.push(model);
      if (model === "gemini-2.5-flash") return new Response("You exceeded your current quota", { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "lite" }] } }] }));
    }));
    const { llmCascade } = await import("@/lib/llmCascade");
    const out = await llmCascade({ messages: [{ role: "user", content: "hello" }] });
    expect(out).toMatchObject({ provider: "gemini-lite", model: "gemini-2.5-flash-lite", text: "lite" });
    expect(models).toEqual(["gemini-2.5-flash", "gemini-2.5-flash-lite"]);
  });

  it("finds a current Flash-Lite from Google's model list when the default one is retired", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    const used: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/openai/models")) {
        return new Response(JSON.stringify({ data: [{ id: "models/gemini-2.5-flash" }, { id: "models/gemini-3.0-flash-lite" }, { id: "models/gemini-3.0-flash-lite-tts" }] }));
      }
      const model = decodeURIComponent(url.match(/models\/([^:]+):/)?.[1] ?? "");
      used.push(model);
      if (model === "gemini-2.5-flash-lite") return new Response("This model models/gemini-2.5-flash-lite is no longer available.", { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    }));
    const { llmCascade } = await import("@/lib/llmCascade");
    const out = await llmCascade({ preferProvider: "gemini-lite", messages: [{ role: "user", content: "hello" }] });
    expect(out).toMatchObject({ provider: "gemini-lite", model: "gemini-3.0-flash-lite" });
    expect(used).toEqual(["gemini-2.5-flash-lite", "gemini-3.0-flash-lite"]);
  });
});
