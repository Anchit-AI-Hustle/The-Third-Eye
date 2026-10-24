import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: () => null }));

import { llmCascade, resetCooldowns, toolCallCascade } from "@/lib/llmCascade";
import { enterPersona, ollamaUrlProblem, withKeys } from "@/lib/providerKeys";

const ENV = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY", "GROQ_API_KEY",
  "CEREBRAS_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY", "HF_TOKEN", "OLLAMA_ENABLED", "OLLAMA_BASE", "LLM_PRIMARY_PROVIDER"];
const clear = () => { for (const k of ENV) delete process.env[k]; };
const host = (u: string) => new URL(u).hostname;

function stub(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const seen: { url: string; auth?: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    seen.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    const { status, body } = handler(url, init);
    return { ok: status < 400, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) };
  }));
  return seen;
}
const ok = (content: string) => ({ status: 200, body: { choices: [{ message: { content } }] } });

beforeEach(() => { clear(); resetCooldowns(); });
afterEach(() => { vi.unstubAllGlobals(); clear(); resetCooldowns(); });

describe("a user's own provider keys", () => {
  it("are used for that user's requests ahead of the deployment's key", async () => {
    process.env.GROQ_API_KEY = "shared-groq";
    const seen = stub(() => ok("hi"));
    const r = await withKeys({ userId: "a@x.com", groq: "own-groq" }, () => llmCascade({ messages: [{ role: "user", content: "hi" }] }));
    expect(r.provider).toBe("groq");
    expect(seen[0].auth).toBe("Bearer own-groq");
  });

  it("make a provider available that the deployment has no key for", async () => {
    const seen = stub(() => ok("from mistral"));
    const r = await withKeys({ userId: "a@x.com", mistral: "own-mistral" }, () => llmCascade({ messages: [{ role: "user", content: "hi" }] }));
    expect(r.provider).toBe("mistral");
    expect(seen.every((s) => host(s.url) === "api.mistral.ai")).toBe(true);
  });

  it("a Hugging Face sign-in runs chats on the user's own Hugging Face account", async () => {
    const seen = stub(() => ok("from hf"));
    const r = await withKeys({ userId: "a@x.com", huggingface: "hf_oauth_own" }, () => llmCascade({ messages: [{ role: "user", content: "hi" }] }));
    expect(r.provider).toBe("huggingface");
    expect(seen[0]).toEqual({ url: "https://router.huggingface.co/v1/chat/completions", auth: "Bearer hf_oauth_own" });
  });

  it("do not leak to another user's request", async () => {
    process.env.GROQ_API_KEY = "shared-groq";
    const seen = stub(() => ok("hi"));
    await withKeys({ userId: "a@x.com", groq: "own-groq" }, async () => {});
    await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    expect(seen[0].auth).toBe("Bearer shared-groq");
  });

  it("are benched on their own: a 429 on the user's key leaves the shared key in use for others", async () => {
    process.env.GROQ_API_KEY = "shared-groq";
    stub((_u, init) => ((init.headers as Record<string, string>).Authorization === "Bearer own-groq"
      ? { status: 429, body: { error: { message: "rate limit" } } } : ok("shared ok")));
    await withKeys({ userId: "a@x.com", groq: "own-groq" }, () => llmCascade({ messages: [{ role: "user", content: "hi" }] }).catch(() => null));
    const other = await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    expect(other.provider).toBe("groq");
    expect(other.text).toBe("shared ok");
  });

  it("reach the tool-calling fallback too", async () => {
    const seen = stub(() => ({ status: 200, body: { choices: [{ message: { content: "done", tool_calls: [] } }] } }));
    await withKeys({ userId: "a@x.com", groq: "own-groq" }, () => toolCallCascade({ messages: [{ role: "user", content: "hi" }], tools: [] }));
    expect(seen[0].auth).toBe("Bearer own-groq");
  });

  it("an own Ollama URL is called instead of localhost", async () => {
    const seen = stub(() => ok("local answer"));
    const r = await withKeys({ userId: "a@x.com", ollama: "https://my-mac.example.com/" }, () => llmCascade({ messages: [{ role: "user", content: "hi" }] }));
    expect(r.provider).toBe("ollama");
    expect(r.text).toBe("local answer");
    expect(seen[0].url).toBe("https://my-mac.example.com/v1/chat/completions");
  });

  it("a local model answers tool calls when no cloud provider can", async () => {
    process.env.GROQ_API_KEY = "shared-groq";
    const seen = stub((url) => host(url) === "api.groq.com"
      ? { status: 429, body: { error: { message: "rate limit" } } }
      : { status: 200, body: { choices: [{ message: { content: null, tool_calls: [{ id: "1", type: "function", function: { name: "manage_tasks", arguments: "{}" } }] } }] } });
    const r = await withKeys({ userId: "a@x.com", ollama: "https://my-mac.example.com", local_first: "off" }, () => toolCallCascade({ messages: [{ role: "user", content: "add a task" }], tools: [] }));
    expect(r.provider).toBe("ollama");
    expect(r.tool_calls?.[0].function.name).toBe("manage_tasks");
    expect(host(seen[0].url)).toBe("api.groq.com");
    expect(seen.at(-1)?.url).toBe("https://my-mac.example.com/v1/chat/completions");
  });

  it("sends OLLAMA_API_KEY so the local server can sit behind an authenticated tunnel", async () => {
    process.env.OLLAMA_ENABLED = "1";
    process.env.OLLAMA_BASE = "https://jarvis.example.com";
    process.env.OLLAMA_API_KEY = "local-secret";
    const seen = stub(() => ok("x"));
    await llmCascade({ messages: [{ role: "user", content: "hi" }] });
    expect(seen[0].auth).toBe("Bearer local-secret");
    delete process.env.OLLAMA_API_KEY;
  });

  it("never sends the deployment's OLLAMA_API_KEY to a user's own Ollama URL", async () => {
    process.env.OLLAMA_API_KEY = "local-secret";
    const seen = stub(() => ok("x"));
    await withKeys({ userId: "a@x.com", ollama: "https://their-mac.example.com" }, () => llmCascade({ messages: [{ role: "user", content: "hi" }] }));
    expect(seen[0].url).toBe("https://their-mac.example.com/v1/chat/completions");
    expect(seen[0].auth).toBe("Bearer ollama");
    delete process.env.OLLAMA_API_KEY;
  });
});

describe("the user's own computer, answering first", () => {
  const mac = { userId: "a@x.com", ollama: "https://my-mac.example.com" };
  const chat = () => llmCascade({ messages: [{ role: "user", content: "hi" }] });
  const body = (init: RequestInit) => JSON.parse(String(init.body)) as { model: string };

  it("is tried before the free cloud tiers by default", async () => {
    process.env.GROQ_API_KEY = "shared-groq";
    const seen = stub(() => ok("local"));
    const r = await withKeys(mac, chat);
    expect(r.provider).toBe("ollama");
    expect(seen.map((s) => host(s.url))).toEqual(["my-mac.example.com"]);
  });

  it("goes back to last when the user turns local-first off", async () => {
    process.env.GROQ_API_KEY = "shared-groq";
    stub(() => ok("cloud"));
    expect((await withKeys({ ...mac, local_first: "off" }, chat)).provider).toBe("groq");
  });

  it("calls tools on the computer first too", async () => {
    process.env.GROQ_API_KEY = "shared-groq";
    const seen = stub(() => ({ status: 200, body: { choices: [{ message: { content: "done", tool_calls: [] } }] } }));
    const r = await withKeys(mac, () => toolCallCascade({ messages: [{ role: "user", content: "hi" }], tools: [] }));
    expect(r.provider).toBe("ollama");
    expect(host(seen[0].url)).toBe("my-mac.example.com");
  });

  it("falls through to the cloud when the computer is asleep, then skips it for a while", async () => {
    process.env.GROQ_API_KEY = "shared-groq";
    const seen = stub((url) => host(url) === "my-mac.example.com" ? { status: 530, body: "tunnel down" } : ok("cloud"));
    expect((await withKeys(mac, chat)).provider).toBe("groq");
    seen.length = 0;
    expect((await withKeys(mac, chat)).provider).toBe("groq");
    expect(seen.some((s) => host(s.url) === "my-mac.example.com")).toBe(false);
  });

  it("runs the model the user chose, and an assistant's own model over it", async () => {
    const models: string[] = [];
    stub((_u, init) => { models.push(body(init).model); return ok("x"); });
    const keys = { ...mac, ollama_model: "qwen2.5:14b", ollama_models: JSON.stringify({ friday: "llama3.2:3b" }) };
    await withKeys(keys, chat);
    await withKeys(keys, async () => { enterPersona("friday"); await chat(); });
    await withKeys(keys, async () => { enterPersona("jarvis"); await chat(); });
    expect(models).toEqual(["qwen2.5:14b", "llama3.2:3b", "qwen2.5:14b"]);
  });

  it("sends the tunnel password: user:password as Basic auth, anything else as a bearer token", async () => {
    const seen = stub(() => ok("x"));
    await withKeys({ ...mac, ollama_token: "me:s3cret" }, chat);
    await withKeys({ ...mac, ollama_token: "tok123" }, chat);
    expect(seen.map((s) => s.auth)).toEqual([`Basic ${Buffer.from("me:s3cret").toString("base64")}`, "Bearer tok123"]);
  });

  it("ignores an assistant id that isn't a plain name", async () => {
    const models: string[] = [];
    stub((_u, init) => { models.push(body(init).model); return ok("x"); });
    await withKeys({ ...mac, ollama_model: "qwen2.5:14b", ollama_models: JSON.stringify({ "a b": "evil" }) }, async () => { enterPersona("a b"); await chat(); });
    expect(models).toEqual(["qwen2.5:14b"]);
  });
});

describe("background work", () => {
  it("never spends paid credit", async () => {
    process.env.OPENAI_API_KEY = "paid";
    process.env.ANTHROPIC_API_KEY = "paid";
    process.env.LLM_PRIMARY_PROVIDER = "openai";
    const seen = stub(() => ok("x"));
    await expect(llmCascade({ messages: [{ role: "user", content: "scan" }], background: true })).rejects.toThrow();
    expect(seen).toHaveLength(0);
  });

  it("still uses free tiers", async () => {
    process.env.OPENAI_API_KEY = "paid";
    process.env.GROQ_API_KEY = "free";
    process.env.LLM_PRIMARY_PROVIDER = "openai";
    stub(() => ok("x"));
    const r = await llmCascade({ messages: [{ role: "user", content: "scan" }], background: true });
    expect(r.provider).toBe("groq");
  });
});

describe("ollamaUrlProblem", () => {
  it("accepts a public https URL", () => {
    expect(ollamaUrlProblem("https://my-mac.trycloudflare.com")).toBeNull();
  });
  it.each(["http://my-mac.example.com", "https://localhost:11434", "https://127.0.0.1", "https://10.0.0.5",
    "https://192.168.1.2", "https://172.16.0.1", "https://169.254.169.254", "https://[::1]", "https://foo.internal", "not a url"])(
    "rejects %s", (u) => { expect(ollamaUrlProblem(u)).not.toBeNull(); });
});
