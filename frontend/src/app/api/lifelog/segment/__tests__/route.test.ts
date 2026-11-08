import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, any>();
const upsert = vi.fn(async (row: any) => { rows.set(row.id, row); return { error: null }; });
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => true) }));
vi.mock("@/lib/lifelog/actions", () => ({ saveLifeActions: vi.fn(async (_e: string, _d: string, a: any[]) => a.map((x) => ({ ...x, saved: true }))) }));
const extract = vi.fn();
vi.mock("@/lib/lifelog/extract", () => ({ extractDay: (...a: unknown[]) => extract(...a) }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    from: () => {
      let id = "";
      const q: any = {
        select: () => q,
        eq: (col: string, v: string) => { if (col === "id") id = v; return q; },
        maybeSingle: async () => ({ data: rows.get(id) ?? null }),
        upsert,
      };
      return q;
    },
  }),
}));

import { POST } from "@/app/api/lifelog/segment/route";

const post = (segment: object, tzOffset = -330) => POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ segment, tzOffset }) }));
// 2026-11-08 23:50 in India is 18:20 UTC; it belongs to the 8th there.
const t = Date.parse("2026-11-08T18:20:00Z");

beforeEach(() => { rows.clear(); extract.mockReset(); });

describe("Life Log segment intake", () => {
  it("files the chunk under the user's local day and re-reads the day every third spoken chunk", async () => {
    extract.mockResolvedValue({ events: [{ title: "Planning", kind: "meeting", time: "23:51" }], summary: "Late planning", actions: [{ type: "task", title: "Send deck", needsYou: false }] });
    for (let i = 0; i < 3; i++) {
      const d = await (await post({ id: `s${i}`, startTs: t + i * 45_000, endTs: t + (i + 1) * 45_000, transcript: `line ${i}` })).json();
      expect(d.date).toBe("2026-11-08");
      expect(d.followUps).toBe(i === 2 ? 1 : 0);
    }
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract.mock.calls[0][0]).toContain("[23:50] line 0");
    const day = rows.get("2026-11-08");
    expect(day.segments).toHaveLength(3);
    expect(day.summary).toBe("Late planning");
    expect(new Date(day.events[0].ts).toISOString()).toBe("2026-11-08T18:21:00.000Z");
  });

  it("does not add the same chunk twice", async () => {
    await post({ id: "a", startTs: t, endTs: t + 1, transcript: "" , silent: true });
    await post({ id: "a", startTs: t, endTs: t + 1, transcript: "", silent: true });
    expect(rows.get("2026-11-08").segments).toHaveLength(1);
  });
});
