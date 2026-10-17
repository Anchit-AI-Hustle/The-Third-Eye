import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What each chat tool hands back, driven through the real /api/chat route with
// a scripted model: one turn per tool call, then a final turn that repeats the
// tool results so the test can read them.
vi.mock("@/lib/serverIdentity", () => ({ identify: async () => ({ email: "u@x.com", source: "browser" }) }));
vi.mock("@/lib/agentGuard", () => ({ isAgentKilled: async () => false, logAgentAction: async () => {} }));
vi.mock("@/lib/usage", () => ({ consume: async () => ({ allowed: true, tier: "premium", limit: 0, limits: { chatModel: "gemini" } }) }));
vi.mock("@/lib/memoryStore", () => ({ loadMemory: async () => ({}), saveMemory: async () => {} }));
vi.mock("@/lib/cortex", () => ({ retrieveMemories: async () => [], searchChunks: async () => [], rememberExchange: async () => {} }));
vi.mock("@/lib/mcp/client", () => ({ mcpToolDeclarations: async () => [], isMcpTool: () => false, callMcpTool: async () => "" }));
vi.mock("@/lib/googleToken", async (orig) => ({ ...(await orig<typeof import("@/lib/googleToken")>()), getGoogleAccessToken: async () => null }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> | null = null;
function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let insert: Row | null = null;
  const rows = () => (tables![table] ?? []).filter((r) => filters.every((f) => f(r)));
  // Any builder method the route uses and this fake does not model is a no-op.
  const q: Record<string, unknown> = new Proxy({
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
    insert: (r: Row) => { insert = { id: "r1", ...r }; (tables![table] ??= []).push(insert); return q; },
    single: async () => ({ data: insert, error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => res({ data: rows(), error: null, count: rows().length }),
  } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => q) });
  return q;
}
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), getDb: () => (tables ? { from } : null) }));

let calls: { name: string; args: unknown }[] = [];
async function run(body: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/chat/route");
  const res = await POST(new Request("https://x.test/api/chat", { method: "POST", body: JSON.stringify({ message: "go", ...body }) }) as never);
  const events = (await res.text()).split("\n\n").filter(Boolean).map((b) => {
    const [ev, data] = b.split("\n");
    return { event: ev.slice(7), data: JSON.parse(data.slice(6)) };
  });
  const text = events.filter((e) => e.event === "text").map((e) => e.data.text).join("");
  return { text, results: text.split("\n#").slice(1), done: events.find((e) => e.event === "done")?.data };
}

beforeEach(() => {
  vi.resetModules();
  tables = null;
  calls = [];
  vi.stubEnv("GROQ_API_KEY", "gsk_test");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!String(url).startsWith("https://api.groq.com")) return new Response("{}", { status: 500 });
    if (String(url).endsWith("/models")) return new Response(JSON.stringify({ data: [] }));
    const msgs = JSON.parse(String(init?.body)).messages as { role: string; content: string }[];
    const done = msgs.filter((m) => m.role === "tool");
    const message = done.length < calls.length
      ? { content: null, tool_calls: [{ id: `c${done.length}`, type: "function", function: { name: calls[done.length].name, arguments: JSON.stringify(calls[done.length].args) } }] }
      : { content: "DONE" + done.map((d) => `\n#${d.content}`).join("") };
    return new Response(JSON.stringify({ choices: [{ message }] }));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("chat tools", () => {
  it("still answers when a tool throws, instead of an empty reply", async () => {
    calls = [{ name: "generate", args: { type: "invoice", client: "Acme", items: "Design:2:5000", tax_rate: 18 } }];
    const r = await run();
    expect(r.text).toMatch(/Invoice/);
    expect(r.text).toContain("₹11,800.00");
  });

  it("finds a task it created earlier in the same reply", async () => {
    calls = [
      { name: "manage_tasks", args: { action: "create", title: "Review Q2 deck" } },
      { name: "manage_tasks", args: { action: "search", filter: "open" } },
    ];
    const r = await run();
    expect(r.results[1]).toContain("Review Q2 deck");
  });

  it("reads tasks from the database, not from the list the browser sent", async () => {
    tables = { tasks: [{ id: "t1", user_id: "u@x.com", title: "Saved in the cloud", status: "todo", priority: "high" }, { id: "t2", user_id: "other@x.com", title: "Someone else's", status: "todo" }] };
    calls = [{ name: "manage_tasks", args: { action: "search", filter: "open" } }];
    const r = await run({ tasks: [{ id: "stale", title: "Stale browser copy", status: "todo" }] });
    expect(r.results[0]).toContain("Saved in the cloud");
    expect(r.results[0]).not.toMatch(/Stale browser copy|Someone else/);
  });

  it("updates a goal named by its title", async () => {
    calls = [{ name: "manage_goals", args: { action: "update", title: "run 100km", delta: 5 } }];
    const r = await run({ goals: [{ id: "g1", title: "Run 100km", current: 10, target: 100, unit: "km" }] });
    expect(r.results[0]).toContain('"Run 100km"');
    expect(r.done.sideEffects).toContainEqual({ type: "goal_update", data: { id: "g1", delta: 5, set_to: undefined } });
  });

  it("says a goal it cannot find was not updated", async () => {
    calls = [{ name: "manage_goals", args: { action: "update", title: "Swim", delta: 1 } }];
    const r = await run();
    expect(r.results[0]).toMatch(/No goal matching "Swim"/);
    expect(r.done.sideEffects).toEqual([]);
  });

  it("works out an EMI from a short calculator name", async () => {
    calls = [{ name: "calculate", args: { slug: "emi", inputs: { principal: 1000000, rate: 9, years: 20 } } }];
    const r = await run();
    const out = JSON.parse(r.results[0]);
    expect(Math.round(out.values.emi)).toBe(8997);
  });

  it("asks for the inputs a calculator is missing instead of returning nulls", async () => {
    calls = [{ name: "calculate", args: { slug: "emi-calculator", inputs: { principal: 1000000, rate: 9, tenure: 20 } } }];
    const r = await run();
    expect(r.results[0]).toMatch(/needs years/);
    expect(r.results[0]).not.toContain("null");
  });

  it("charts every label:value pair on one line", async () => {
    calls = [{ name: "generate", args: { type: "chart", title: "Sales", chart_type: "bar", data: "Jan:10,Feb:20,Mar:15" } }];
    const r = await run();
    expect(r.results[0]).toMatch(/\*\*Jan\*\*.* 10/);
    expect(r.results[0]).toMatch(/\*\*Feb\*\*.* 20/);
    expect(r.results[0]).toMatch(/\*\*Mar\*\*.* 15/);
  });

  it("delivers a document as a file to save and open, not a data: link browsers block", async () => {
    calls = [{ name: "generate", args: { type: "pdf", title: "Q2 <Report>", prompt: "Revenue grew" } }];
    const r = await run();
    expect(r.text).not.toContain("data:text/html");
    const file = r.done.sideEffects.find((s: { type: string }) => s.type === "file");
    expect(file.data).toMatchObject({ filename: "Q2-Report.html", mime: "text/html" });
    expect(file.data.content).toContain("Revenue grew");
    expect(file.data.content).toContain("Q2 &lt;Report&gt;");
  });

  it("states a reminder time in the user's own time zone", async () => {
    tables = { reminders: [] };
    calls = [{ name: "manage_reminders", args: { action: "set", title: "Call mom", fire_at: "2026-10-18T10:00:00+05:30" } }];
    const r = await run({ timezone: "Asia/Kolkata" });
    expect(r.results[0]).toMatch(/18 Oct 2026, 10:00/);
  });
});

describe("contacts and emergencies", () => {
  it("never invents a contact: messaging Mom with none saved asks for her number", async () => {
    calls = [{ name: "communicate", args: { action: "whatsapp", to: "Mom", message: "hi" } }];
    const r = await run();
    expect(r.text).not.toContain("98765");
    const open = r.done.sideEffects.find((s: { type: string }) => s.type === "open_url");
    expect(open?.data.missingPhone ?? true).toBe(true);
  });

  it("matches a saved contact by name, not by any word that contains it", async () => {
    calls = [{ name: "communicate", args: { action: "whatsapp", to: "Momentum Labs", message: "hi" } }];
    const r = await run({ contacts: [{ name: "Mom", phone: "+919811111111" }] });
    expect(r.text).not.toContain("9811111111");
  });

  it("opens the dialer on 112 instead of claiming to alert anyone", async () => {
    calls = [{ name: "emergency_alert", args: { message: "Need help" } }];
    const r = await run({ location: { latitude: 28.6139, longitude: 77.209 } });
    expect(r.done.sideEffects).toContainEqual({ type: "open_url", data: { url: "tel:112", label: "Call 112", action: "call", to: "112" } });
    expect(r.results[0]).toContain("maps.google.com/?q=28.61390,77.20900");
    expect(r.results[0]).not.toMatch(/being shared|I'll also open WhatsApp/);
  });
});
