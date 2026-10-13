import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const cascade = vi.fn();
vi.mock("@/lib/llmCascade", async (orig) => ({ ...(await orig<typeof import("@/lib/llmCascade")>()), llmCascade: (o: unknown) => cascade(o) }));

import { POST } from "@/app/api/capture/extract/route";
import { LlmCascadeError } from "@/lib/llmCascade";

const req = () => new Request("https://x/api/capture/extract", { method: "POST", body: JSON.stringify({ transcript: "We need to send the deck to Aman by Friday and call the bank." }) });

beforeEach(() => { cascade.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("/api/capture/extract", () => {
  it("asks the provider for JSON mode", async () => {
    cascade.mockResolvedValue({ text: '{"type":"work","summary":"s","tasks":[],"reminders":[],"ideas":[]}' });
    await POST(req() as never);
    expect(cascade.mock.calls[0][0].jsonMode).toBe(true);
  });

  it("returns the complete items from truncated output, with the reason", async () => {
    cascade.mockResolvedValue({ text: '{"type":"work","summary":"Deck and bank","tasks":[{"title":"Send deck to Aman","priority":"high","due_date":""},{"title":"Call the ba' });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ type: "work", summary: "Deck and bank", tasks: [{ title: "Send deck to Aman", priority: "high" }], reminders: [], ideas: [] });
    expect(body.partial).toMatch(/repaired/);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/capture extract partial/), expect.anything());
  });

  it("drops items that fail the schema and coerces bad fields", async () => {
    cascade.mockResolvedValue({ text: '{"type":"nonsense","summary":5,"tasks":[{"title":"Real task","priority":"whenever"},{"priority":"high"},"text"],"reminders":[{"text":"Bank at 5"}],"ideas":["x",7]}' });
    const body = await (await POST(req() as never)).json();
    expect(body.type).toBe("other");
    expect(body.summary).toBe("");
    expect(body.tasks).toEqual([{ title: "Real task", priority: "medium", due_date: "" }]);
    expect(body.reminders).toEqual([{ text: "Bank at 5", when: "" }]);
    expect(body.ideas).toEqual(["x"]);
    expect(body.partial).toMatch(/3 invalid item/);
  });

  it("returns empty results with a reason when the output has no JSON", async () => {
    cascade.mockResolvedValue({ text: "Sorry, I can't do that." });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ type: "other", tasks: [], reminders: [], ideas: [] });
    expect(body.partial).toMatch(/no JSON object/);
  });

  it("says plainly when no provider answered, without a stack", async () => {
    cascade.mockRejectedValue(new LlmCascadeError([{ provider: "groq", model: "m", ok: false, status: 429, reason: "Rate limit reached" }]));
    const res = await POST(req() as never);
    expect(res.status).toBe(503);
    const { error } = await res.json();
    expect(error).toMatch(/^[A-Z][^{}]+\.$/);
  });
});
