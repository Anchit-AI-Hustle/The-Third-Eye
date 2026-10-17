import { beforeEach, describe, expect, it, vi } from "vitest";

type Turn = { text?: string; calls?: { name: string; args: Record<string, unknown> }[] };
let script: Turn[] = [];

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContentStream: async () => {
          const turn = script.shift() ?? { text: "" };
          const parts = [
            ...(turn.text ? [{ text: turn.text }] : []),
            ...(turn.calls ?? []).map((c) => ({ functionCall: c })),
          ];
          return { stream: (async function* () { yield { candidates: [{ content: { parts } }] }; })() };
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

const mockSendWhatsAppText = vi.fn().mockResolvedValue(true);
const mockWhatsappConfigured = vi.fn().mockReturnValue(false);

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppText: (...args: any[]) => mockSendWhatsAppText(...args),
  whatsappConfigured: () => mockWhatsappConfigured(),
}));

async function chat(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/chat/route");
  const res = await POST(new Request("https://x.test/api/chat", { method: "POST", body: JSON.stringify(body) }) as never);
  const raw = await res.text();
  const events = raw.split("\n\n").filter(Boolean).map((block) => {
    const [ev, data] = block.split("\n");
    return { event: ev.slice(7), data: JSON.parse(data.slice(6)) };
  });
  return {
    events,
    text: events.filter((e) => e.event === "text").map((e) => e.data.text).join(""),
    done: events.find((e) => e.event === "done")?.data,
  };
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubEnv("LLM_PRIMARY_PROVIDER", "gemini");
  mockSendWhatsAppText.mockReset().mockResolvedValue(true);
  mockWhatsappConfigured.mockReset().mockReturnValue(false);
  script = [];
});

describe("communicate tool in /api/chat", () => {
  it("resolves contact name from synced device contacts to phone number and generates WhatsApp deep link", async () => {
    script = [
      { calls: [{ name: "communicate", args: { action: "whatsapp", to: "Mom", message: "Hi Mom" } }] },
      { text: "I've prepared the WhatsApp message for Mom." },
    ];

    const res = await chat({
      message: "send a whatsapp to Mom saying Hi Mom",
      contacts: [
        { id: "c1", name: "Mom", phone: "+91 9873945238", relationship: "Mother" },
      ],
    });

    expect(res.done?.sideEffects).toBeDefined();
    const openUrl = res.done.sideEffects.find((fx: any) => fx.type === "open_url");
    expect(openUrl).toBeDefined();
    expect(openUrl.data.url).toContain("919873945238");
    expect(openUrl.data.nativeUrl).toContain("whatsapp://send?phone=919873945238");
    expect(openUrl.data.message).toBe("Hi Mom");
  });

  it("sends directly via Meta Cloud API when WhatsApp is configured", async () => {
    mockWhatsappConfigured.mockReturnValue(true);
    mockSendWhatsAppText.mockResolvedValue(true);

    script = [
      { calls: [{ name: "communicate", args: { action: "whatsapp", to: "9873945238", message: "Hello directly" } }] },
      { text: "WhatsApp sent directly." },
    ];

    const res = await chat({
      message: "send whatsapp to 9873945238 saying Hello directly",
    });

    expect(mockSendWhatsAppText).toHaveBeenCalledWith("919873945238", "Hello directly");
    expect(res.text).toContain("WhatsApp sent directly");
  });

  it("does not resolve a name nobody saved to a built-in number", async () => {
    script = [
      { calls: [{ name: "communicate", args: { action: "whatsapp", to: "Aviral Mehta", message: "Project update ready" } }] },
      { text: "WhatsApp link prepared for Aviral Mehta." },
    ];

    const res = await chat({
      message: "send whatsapp to Aviral Mehta saying Project update ready",
      contacts: [],
    });

    expect(res.done?.sideEffects).toBeDefined();
    const openUrl = res.done.sideEffects.find((fx: any) => fx.type === "open_url");
    expect(openUrl?.data.url ?? "").not.toContain("919811122334");
  });

  it("manage_contacts searches and retrieves synced phone contacts", async () => {
    script = [
      { calls: [{ name: "manage_contacts", args: { action: "search", query: "Aviral Mehta" } }] },
      { text: "Found contact details for Aviral Mehta." },
    ];

    const res = await chat({
      message: "look up Aviral Mehta's number",
      contacts: [],
    });

    expect(res.text).toContain("Found contact details for Aviral Mehta");
  });

  it("manage_contacts lists all synced contacts", async () => {
    script = [
      { calls: [{ name: "manage_contacts", args: { action: "list" } }] },
      { text: "Here are your synced device contacts." },
    ];

    const res = await chat({
      message: "list all my contacts",
    });

    expect(res.text).toContain("Here are your synced device contacts");
  });
});
