import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What reaches the model: the phone's synced contact book must not be pasted
// into the prompt whole (it once pushed a request past Groq's limit).
const memory = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const modelParams = vi.hoisted(() => [] as Array<{ generationConfig?: { thinkingConfig?: { thinkingBudget?: number } } }>);
vi.mock("@google/generative-ai", () => ({ GoogleGenerativeAI: class { getGenerativeModel(p: never) { modelParams.push(p); return {}; } } }));
vi.mock("@/lib/serverIdentity", () => ({ identify: async () => ({ email: "+919999999999", source: "browser" }) }));
vi.mock("@/lib/agentGuard", () => ({ isAgentKilled: async () => false, logAgentAction: async () => {} }));
vi.mock("@/lib/usage", () => ({ consume: async () => ({ allowed: true, tier: "premium", limit: 0, limits: { chatModel: "gemini" } }) }));
vi.mock("@/lib/memoryStore", () => ({ loadMemory: async () => memory.value, saveMemory: async () => {} }));
vi.mock("@/lib/cortex", () => ({ retrieveMemories: async () => [], searchChunks: async () => [], rememberExchange: async () => {} }));
vi.mock("@/lib/mcp/client", () => ({ mcpToolDeclarations: async () => [], isMcpTool: () => false, callMcpTool: async () => "" }));
vi.mock("@/lib/googleToken", async (orig) => ({ ...(await orig<typeof import("@/lib/googleToken")>()), getGoogleAccessToken: async () => null }));

const systemPrompts: string[] = [];

beforeEach(() => {
  vi.resetModules();
  systemPrompts.length = 0;
  modelParams.length = 0;
  vi.stubEnv("GEMINI_API_KEY", "x".repeat(39));
  vi.stubEnv("GROQ_API_KEY", "gsk_test");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.hostname !== "api.groq.com") return new Response("{}", { status: 500 });
    if (u.pathname.endsWith("/models")) return new Response(JSON.stringify({ data: [] }));
    const body = JSON.parse(String(init?.body));
    systemPrompts.push(body.messages.find((m: { role: string }) => m.role === "system")?.content ?? "");
    return new Response(JSON.stringify({ choices: [{ message: { content: "Done." } }] }));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("/api/chat prompt", () => {
  it("lists a big synced contact book once, capped, not as raw memory", async () => {
    const contacts = Array.from({ length: 3000 }, (_, i) => ({ name: `Person ${i}`, phone: `+9198${String(i).padStart(8, "0")}` }));
    memory.value = { device_contacts: JSON.stringify(contacts), favourite_colour: "blue" };
    const { POST } = await import("@/app/api/chat/route");
    await (await POST(new Request("https://x.test/api/chat", { method: "POST", body: JSON.stringify({ message: "hi" }) }) as never)).text();

    const system = systemPrompts[0];
    expect(system).toContain("favourite_colour: blue");
    expect(system).toContain("Synced Device Contacts** (3000)");
    expect(system).not.toContain("Person 2999");
    expect(system).not.toContain("device_contacts:");
  });

  it("asks for a short spoken answer with no thinking pause on a voice turn", async () => {
    const { POST } = await import("@/app/api/chat/route");
    await (await POST(new Request("https://x.test/api/chat", { method: "POST", body: JSON.stringify({ message: "what's on today", voice: true }) }) as never)).text();
    expect(systemPrompts[0]).toContain("## Spoken conversation");
    expect(modelParams[0].generationConfig?.thinkingConfig?.thinkingBudget).toBe(0);
  });

  it("caps thinking on a short typed message and leaves long ones at full depth", async () => {
    const { POST } = await import("@/app/api/chat/route");
    await (await POST(new Request("https://x.test/api/chat", { method: "POST", body: JSON.stringify({ message: "hi" }) }) as never)).text();
    await (await POST(new Request("https://x.test/api/chat", { method: "POST", body: JSON.stringify({ message: "plan ".repeat(200) }) }) as never)).text();
    expect(systemPrompts[0]).not.toContain("## Spoken conversation");
    expect(modelParams.map((p) => p.generationConfig?.thinkingConfig?.thinkingBudget)).toEqual([1024, -1]);
  });
});
