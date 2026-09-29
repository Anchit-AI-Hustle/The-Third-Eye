import { beforeEach, describe, expect, it, vi } from "vitest";

const cascade = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (...a: unknown[]) => cascade(...a) }));

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/tools/book/route");
  return POST(new Request("https://x.test/api/tools/book", { method: "POST", body: JSON.stringify(body) }) as never);
};

const book = { title: "The Last Signal", genre: "Fiction — thriller", outline: "### Chapter 1: Static\n- She hears it." };
const chapter = { n: 1, title: "Static", beats: "- She hears it." };
const prose = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

beforeEach(() => { vi.clearAllMocks(); });

describe("/api/tools/book", () => {
  it("writes one part of a chapter, carrying on from the text so far", async () => {
    cascade.mockResolvedValue({ text: `## Chapter 1: Static\n\n${prose(200)}` });
    const res = await post({ action: "chapter", book, chapter, part: 2, of: 2, words: 5000, sofar: "…and the light went out." });
    const { text } = await res.json();
    expect(text).toBe(prose(200));
    const { system, messages, maxTokens } = cascade.mock.calls[0][0];
    expect(system).toContain("part 2 of 2");
    expect(system).toContain("About 2500 words");
    expect(messages[0].content).toContain("…and the light went out.");
    expect(maxTokens).toBeLessThanOrEqual(8000);
  });

  it("refuses a chapter without its outline, number or a valid part", async () => {
    for (const body of [
      { action: "chapter", book: {}, chapter },
      { action: "chapter", book, chapter: { title: "x" } },
      { action: "chapter", book, chapter, part: 3, of: 2 },
    ]) expect((await post(body)).status).toBe(400);
    expect(cascade).not.toHaveBeenCalled();
  });

  it("reports a chapter that came back too short instead of saving it", async () => {
    cascade.mockResolvedValue({ text: "Sorry, I can't." });
    expect((await post({ action: "chapter", book, chapter })).status).toBe(502);
  });

  it("drafts a store listing, trimmed to the store's seven keywords", async () => {
    cascade.mockResolvedValue({ text: `Here: {"title":"The Last Signal","subtitle":"s","description":"d","keywords":["a","b","c","d","e","f","g","h"],"categories":["Fiction / Thrillers"],"audience":"Adult"}` });
    const { listing } = await (await post({ action: "listing", book, sample: "It began." })).json();
    expect(listing.keywords).toHaveLength(7);
    cascade.mockResolvedValue({ text: "not json" });
    expect((await post({ action: "listing", book })).status).toBe(502);
  });
});
