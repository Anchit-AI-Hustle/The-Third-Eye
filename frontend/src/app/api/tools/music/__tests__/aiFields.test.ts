import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/llmCascade", () => ({ llmCascade: vi.fn() }));
import { llmCascade } from "@/lib/llmCascade";

const cascade = vi.mocked(llmCascade);
const reply = (text: string) => cascade.mockResolvedValueOnce({ text, provider: "test" } as Awaited<ReturnType<typeof llmCascade>>);
const req = (body: unknown) => new Request("https://x.test", { method: "POST", body: JSON.stringify(body) }) as never;
afterEach(() => vi.clearAllMocks());

describe("auto-fill", () => {
  async function infer(description: string) {
    const { POST } = await import("@/app/api/tools/music/infer/route");
    return (await (await POST(req({ description }))).json()).fields;
  }

  it("keeps a 200+ BPM request instead of falling back to the genre default", async () => {
    // Anything over 180 used to be rejected and replaced with 145.
    reply(JSON.stringify({ genre: "Psytrance", tempo: 205, subgenre: "Goa Trance,", artistInspiration: "Astrix, 999999999", vocalEffects: ["Heavy delay", "", "voc"] }));
    const f = await infer("relentless psychedelic acid rave at 200+ BPM");
    expect(f.tempo).toBe(205);
    expect(f.subgenre).toBe("Goa Trance");
    expect(f.artistInspiration).toBe("Astrix");
    expect(f.vocalEffects).toBe("Heavy delay, voc");
  });

  it("turns a misspelled prompt into a title, both genres, and moods — never the prompt itself", async () => {
    cascade.mockRejectedValueOnce(new Error("down"));
    const f = await infer("psychadelic acid");
    expect(f.description).toBe("psychedelic acid");
    expect(f.title.toLowerCase()).not.toMatch(/psych|psychedelic acid/);
    expect(f.genre).toMatch(/Psytrance/);
    expect(f.genre).toMatch(/Acid/);
    expect(f.mood).toMatch(/Hypnotic/);
    expect(f.mood).toMatch(/Driving/);
    expect(f.lyricsTheme.toLowerCase()).not.toMatch(/psych/);
    expect(f.artistInspiration).toMatch(/Astrix/);
  });

  it("replaces a title that is just the description", async () => {
    reply(JSON.stringify({ title: "psychadelic acid", genre: "Acid Rave", mood: "Hypnotic & driving" }));
    const f = await infer("psychadelic acid");
    expect(f.title.toLowerCase()).not.toMatch(/psych|psychedelic acid/);
    expect(f.mood).toBe("Hypnotic, Driving");
    expect(f.genre).toMatch(/Psytrance/);
  });

  it("grounds the model in the genre and offers that genre's structures", async () => {
    reply("{}");
    const f = await infer("psychedelic acid rave anthem");
    const content = cascade.mock.calls[0][0].messages[0].content as string;
    expect(content).toMatch(/GENRE KNOWLEDGE:[\s\S]*Psytrance/);
    expect(content).toMatch(/STRUCTURE OPTIONS:\n- .*Drop/);
    expect(f.structure).toMatch(/Drop/);
    expect(f.genre).toContain("Psytrance");
  });
});

describe("per-field suggestions", () => {
  async function suggest(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/tools/music/suggest/route");
    return POST(req(body));
  }

  it("returns a clean value for the field it fills", async () => {
    reply("About 380 BPM for speedcore");
    expect((await (await suggest({ field: "tempo", context: { genre: "Speedcore" } })).json()).suggestion).toBe("380");
    reply("Goa Trance,\nextra line");
    expect((await (await suggest({ field: "subgenre", context: { genre: "Psytrance" } })).json()).suggestion).toBe("Goa Trance");
  });

  it("runs enhance cooler than new, and grounds both in the genre", async () => {
    reply("x"); await suggest({ field: "title", action: "enhance", value: "acid", context: { genre: "Psytrance" } });
    reply("y"); await suggest({ field: "title", action: "new", context: { genre: "Psytrance" } });
    expect(cascade.mock.calls[0][0].temperature).toBeLessThan(cascade.mock.calls[1][0].temperature as number);
    expect(cascade.mock.calls[0][0].system).toMatch(/Genre knowledge[\s\S]*Psytrance/);
  });

  it("enhances a short prompt instead of handing the typo back, even when the model is down", async () => {
    cascade.mockRejectedValueOnce(new Error("down"));
    const res = await suggest({ field: "description", action: "enhance", value: "psychadelic acid", context: { genre: "Pop" } });
    const suggestion = (await res.json()).suggestion as string;
    expect(res.status).toBe(200);
    expect(suggestion.toLowerCase()).toContain("psychedelic");
    expect(suggestion.toLowerCase()).not.toContain("psychadelic");
    expect(suggestion.length).toBeGreaterThan("psychadelic acid".length + 40);
    expect(cascade.mock.calls[0][0].system).toMatch(/Psytrance|psytrance|Acid/);
  });

  it("does not accept the prompt as a song title", async () => {
    reply("psychadelic acid");
    const suggestion = (await (await suggest({ field: "title", action: "suggest", value: "", context: { description: "psychadelic acid", genre: "Pop" } })).json()).suggestion as string;
    expect(suggestion.toLowerCase()).not.toMatch(/psych|psychedelic acid/);
  });

  it("refuses to enhance an empty field", async () => {
    expect((await suggest({ field: "title", action: "enhance", value: "" })).status).toBe(400);
    expect(cascade).not.toHaveBeenCalled();
  });

  it("says so when a number field comes back without a number", async () => {
    reply("very fast");
    expect((await suggest({ field: "tempo", context: {} })).status).toBe(502);
  });
});
