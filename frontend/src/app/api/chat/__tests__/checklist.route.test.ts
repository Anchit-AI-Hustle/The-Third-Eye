import { beforeEach, describe, expect, it, vi } from "vitest";

// The model is scripted turn by turn; everything it touches outside the
// checklist is the real route and the real tool handlers.
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
  script = [];
});

describe("verified checklist in /api/chat", () => {
  it("ticks a step from a real tool result in the same batch, and streams the live checklist", async () => {
    script = [
      { calls: [{ name: "plan_checklist", args: { steps: [
        { title: "Look up the current time", verify: "get_current_time returns an ISO time" },
        { title: "Tell the user", verify: "reply written", needs_tool: false },
      ] } }] },
      { calls: [
        { name: "start_step", args: { step: 1 } },
        { name: "get_current_time", args: { timezone: "Asia/Kolkata" } },
        { name: "complete_step", args: { step: 1, evidence: "get_current_time returned an ISO timestamp" } },
      ] },
      { calls: [{ name: "complete_step", args: { step: 2, evidence: "Answer composed for the user" } }] },
      { text: "It is evening in Kolkata." },
    ];
    const r = await chat({ message: "what time is it, then tell me" });
    expect(r.events.filter((e) => e.event === "checklist").length).toBeGreaterThan(2);
    expect(r.done.checklist.map((s: { status: string }) => s.status)).toEqual(["done", "done"]);
    expect(r.text).toBe("It is evening in Kolkata.");
  });

  it("refuses a tick with no work behind it and tells the user what is still open", async () => {
    script = [
      { calls: [{ name: "plan_checklist", args: { steps: [{ title: "Email Priya the deck", verify: "appears in Sent" }] } }] },
      { calls: [{ name: "complete_step", args: { step: 1, evidence: "Email has been sent to Priya" } }] },
      { text: "All done!" },
    ];
    const r = await chat({ message: "email priya the deck" });
    expect(r.done.checklist[0].status).toBe("pending");
    expect(r.text).toContain("All done!");
    expect(r.text).toContain("**Checklist: 0/1 verified.**");
    expect(r.text).toContain("Email Priya the deck (not verified yet)");
  });

  it("does not tick a send that is only waiting on the user's Confirm", async () => {
    script = [
      { calls: [{ name: "plan_checklist", args: { steps: [{ title: "Send the email", verify: "user confirms and it sends" }] } }] },
      { calls: [{ name: "communicate", args: { action: "email", to: "a@b.co", subject: "Hi", body: "Hello there" } }] },
      { calls: [{ name: "complete_step", args: { step: 1, evidence: "Email sent to a@b.co" } }] },
      { text: "Sent!" },
    ];
    const r = await chat({ message: "email a@b.co hello" });
    expect(r.events.some((e) => e.event === "confirm")).toBe(true);
    expect(r.done.checklist[0].status).toBe("awaiting");
    expect(r.text).toContain("Send the email (waiting for your Confirm)");
  });

  it("resumes an open checklist from the previous reply", async () => {
    script = [
      { calls: [{ name: "get_current_time", args: {} }, { name: "complete_step", args: { step: 2, evidence: "get_current_time returned the time" } }] },
      { text: "Finished." },
    ];
    const r = await chat({
      message: "continue",
      checklist: [
        { id: 1, title: "Step one", verify: "x", needsTool: true, status: "done", evidence: "it was done" },
        { id: 2, title: "Check the time", verify: "time returned", needsTool: true, status: "awaiting" },
      ],
    });
    expect(r.done.checklist.map((s: { status: string }) => s.status)).toEqual(["done", "done"]);
    expect(r.text).toBe("Finished.");
  });
});
