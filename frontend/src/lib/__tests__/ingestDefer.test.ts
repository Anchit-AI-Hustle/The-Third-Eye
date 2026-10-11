import { beforeEach, describe, expect, it, vi } from "vitest";

const marked: string[] = [];
const extract = vi.fn();

vi.mock("@/lib/googleToken", () => ({ getGoogleAccessToken: async () => ({ accessToken: "t", scope: "gmail.readonly" }) }));
vi.mock("@/lib/extract", () => ({ extractEmailTasks: (...a: unknown[]) => extract(...a) }));
vi.mock("@/lib/tasks", () => ({ saveExtractedTasks: async () => ({ inserted: 1, merged: 0 }) }));
vi.mock("@/lib/activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/cron", () => ({
  alreadyProcessed: async () => false,
  markProcessed: async (_sb: unknown, _e: string, _s: string, id: string) => { marked.push(id); },
}));

const ids = Array.from({ length: 12 }, (_, i) => `m${i}`);
beforeEach(() => {
  marked.length = 0;
  extract.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(url.includes("/messages?") ? { messages: ids.map((id) => ({ id })) } : { snippet: "hi", payload: { headers: [] } }))));
});

describe("Gmail scan under provider outages", () => {
  it("stops at the first unavailable model and leaves that email for the next run", async () => {
    extract.mockResolvedValueOnce({ summary: null, isActionable: false, tasks: [] }).mockResolvedValue(null);
    const { scrapeGmailForUser } = await import("@/lib/ingest");
    const out = await scrapeGmailForUser({} as never, "me@x.com");
    expect(extract).toHaveBeenCalledTimes(2);
    expect(marked).toEqual(["m0"]);
    expect(out).toMatchObject({ processed: 1, capped: true });
  });

  it("reads at most 8 emails per run", async () => {
    extract.mockResolvedValue({ summary: null, isActionable: false, tasks: [] });
    const { scrapeGmailForUser } = await import("@/lib/ingest");
    const out = await scrapeGmailForUser({} as never, "me@x.com");
    expect(extract).toHaveBeenCalledTimes(8);
    expect(out).toMatchObject({ processed: 8, capped: true });
  });
});
