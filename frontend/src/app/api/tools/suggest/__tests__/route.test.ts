import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/llmCascade", () => ({ llmCascade: vi.fn() }));
import { llmCascade } from "@/lib/llmCascade";

const cascade = vi.mocked(llmCascade);
const reply = (text: string) => cascade.mockResolvedValueOnce({ text, provider: "test" } as Awaited<ReturnType<typeof llmCascade>>);
afterEach(() => vi.clearAllMocks());

async function suggest(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/tools/suggest/route");
  return POST(new Request("https://x", { method: "POST", body: JSON.stringify(body) }) as never);
}
const tool = { label: "Trip Planner", purpose: "a day-by-day itinerary" };

describe("/api/tools/suggest — the Studio's AI toolbar for any field", () => {
  it("fills a text field with one clean line, coherent with the rest of the form", async () => {
    reply('"Kyoto, Japan."\nBecause temples.');
    const res = await suggest({ tool, field: { name: "destination", label: "Destination", type: "text" }, action: "suggest", context: { Budget: "Luxury", Interests: "temples, food" } });
    expect((await res.json()).suggestion).toBe("Kyoto, Japan");
    const call = cascade.mock.calls[0][0];
    expect(call.system).toContain('"Trip Planner"');
    expect(call.messages[0].content).toContain("- Budget: Luxury");
  });

  it("lands a choice on one of the field's real options", async () => {
    const field = { name: "budget", label: "Budget", type: "select", options: ["Shoestring", "Mid-range", "Luxury"] };
    reply("I'd go with luxury.");
    expect((await (await suggest({ tool, field })).json()).suggestion).toBe("Luxury");
    reply("Something premium");
    expect((await suggest({ tool, field })).status).toBe(502);
  });

  it("keeps a long-form field whole and refuses to enhance nothing", async () => {
    reply("Day 1: arrive.\nDay 2: temples.");
    const field = { name: "interests", label: "Interests", type: "textarea" };
    expect((await (await suggest({ tool, field, action: "enhance", value: "temples" })).json()).suggestion).toBe("Day 1: arrive.\nDay 2: temples.");
    expect(cascade.mock.calls[0][0].temperature).toBe(0.5);
    expect((await suggest({ tool, field, action: "enhance", value: "" })).status).toBe(400);
  });

  it("enhances a long field whole, and refuses one too long to see whole", async () => {
    // It used to send the first 4,000 characters and replace the whole field with the result.
    const field = { name: "transcript", label: "Transcript", type: "textarea" };
    const long = "word ".repeat(1500).trim();
    reply("enhanced");
    await suggest({ tool, field, action: "enhance", value: long });
    expect(cascade.mock.calls[0][0].messages[0].content).toContain(long);
    const res = await suggest({ tool, field, action: "enhance", value: "x".repeat(12_001) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Too long to enhance/);
    const sug = await suggest({ tool, field, action: "suggest", value: "x".repeat(12_001) });
    expect(sug.status).toBe(400);
    expect(cascade).toHaveBeenCalledTimes(1);
    reply("fresh");
    expect((await suggest({ tool, field, action: "new", value: "x".repeat(12_001) })).status).toBe(200);
  });

  it("rejects malformed requests without calling a model", async () => {
    for (const body of [null, {}, { field: { label: "" } }, { field: { label: "Budget", type: "select", options: [] } }]) {
      expect((await suggest(body as never)).status).toBe(400);
    }
    expect(cascade).not.toHaveBeenCalled();
  });
});
