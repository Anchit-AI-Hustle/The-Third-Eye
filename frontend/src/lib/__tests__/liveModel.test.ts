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
    expect(pickModel(groq, [/llama-3\.3-70b/, /gpt-oss-120b/, /gpt-oss-20b/], "llama-3.3-70b-versatile")).toBe("openai/gpt-oss-120b");
    const or = ["openai/gpt-4o", "deepseek/deepseek-chat-v3:free", "qwen/qwen3-32b:free"];
    expect(pickModel(or, [/llama-3\.3-70b.*:free$/, /deepseek.*:free$/, /:free$/], "meta-llama/llama-3.3-70b-instruct:free")).toBe("deepseek/deepseek-chat-v3:free");
    expect(pickModel(["whisper-large-v3"], [/./], "x")).toBeNull();
  });
});

describe("toolCallCascade switches off a retired model", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

  it("lists the provider's models and retries with a served one", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
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
