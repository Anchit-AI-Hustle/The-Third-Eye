import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Which model path /api/chat takes: free Groq tool calling by default, native
// Gemini only for media or when it is the chosen primary.
const geminiCalls = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContentStream: async () => {
          geminiCalls();
          return { stream: (async function* () { yield { candidates: [{ content: { parts: [{ text: "gemini saw it" }] } }] }; })() };
        },
      };
    }
  },
}));
vi.mock("@/lib/serverIdentity", () => ({ identify: async () => ({ email: "+919999999999", source: "browser" }) }));
vi.mock("@/lib/agentGuard", () => ({ isAgentKilled: async () => false, logAgentAction: async () => {} }));
vi.mock("@/lib/usage", () => ({ consume: async () => ({ allowed: true, tier: "premium", limit: 0, limits: { chatModel: "gemini" } }) }));
vi.mock("@/lib/memoryStore", () => ({ loadMemory: async () => ({}), saveMemory: async () => {} }));
vi.mock("@/lib/cortex", () => ({ retrieveMemories: async () => [], searchChunks: async () => [], rememberExchange: async () => {} }));
vi.mock("@/lib/mcp/client", () => ({ mcpToolDeclarations: async () => [], isMcpTool: () => false, callMcpTool: async () => "" }));
vi.mock("@/lib/googleToken", async (orig) => ({ ...(await orig<typeof import("@/lib/googleToken")>()), getGoogleAccessToken: async () => null }));

let groqTurns: unknown[] = [];
const groqModels: string[] = [];

async function chat(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/chat/route");
  const res = await POST(new Request("https://x.test/api/chat", { method: "POST", body: JSON.stringify(body) }) as never);
  const events = (await res.text()).split("\n\n").filter(Boolean).map((block) => {
    const [ev, data] = block.split("\n");
    return { event: ev.slice(7), data: JSON.parse(data.slice(6)) };
  });
  return { events, done: events.find((e) => e.event === "done")?.data, text: events.filter((e) => e.event === "text").map((e) => e.data.text).join("") };
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "x".repeat(39));
  vi.stubEnv("GROQ_API_KEY", "gsk_test");
  geminiCalls.mockReset();
  groqModels.length = 0;
  groqTurns = [
    { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_current_time", arguments: '{"timezone":"Asia/Kolkata"}' } }] } }] },
    { choices: [{ message: { content: "It is evening in Kolkata." } }] },
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.hostname !== "api.groq.com") return new Response("{}", { status: 500 });
    if (u.pathname.endsWith("/models")) return new Response(JSON.stringify({ data: [] }));
    groqModels.push(JSON.parse(String(init?.body)).model);
    return new Response(JSON.stringify(groqTurns.shift()));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("/api/chat provider path", () => {
  it("runs the tool loop on Groq's free tier by default and leaves Gemini's quota alone", async () => {
    const r = await chat({ message: "what time is it?" });
    expect(geminiCalls).not.toHaveBeenCalled();
    expect(r.events.some((e) => e.event === "tool" && e.data.name === "get_current_time")).toBe(true);
    expect(r.text).toBe("It is evening in Kolkata.");
    expect(r.done).toMatchObject({ stop_reason: "fallback_tools", model: "groq:openai/gpt-oss-120b" });
    expect(groqModels).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-120b"]);
  });

  it("uses native Gemini first for an image, which only it can read", async () => {
    const r = await chat({ message: "what is in this?", attachments: [{ name: "a.png", mimeType: "image/png", data: Buffer.from("png").toString("base64") }] });
    expect(geminiCalls).toHaveBeenCalled();
    expect(r.text).toContain("gemini saw it");
    expect(groqModels).toEqual([]);
  });

  it("still uses native Gemini first when it is the chosen primary", async () => {
    vi.stubEnv("LLM_PRIMARY_PROVIDER", "gemini");
    await chat({ message: "hello" });
    expect(geminiCalls).toHaveBeenCalled();
    expect(groqModels).toEqual([]);
  });
});
