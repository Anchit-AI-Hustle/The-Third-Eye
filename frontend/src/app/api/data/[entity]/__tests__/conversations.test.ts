import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const calls: { cols?: string; eq: Array<[string, unknown]> }[] = [];

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "me@example.com" } }) }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    from: () => {
      const call: { cols?: string; eq: Array<[string, unknown]> } = { eq: [] };
      calls.push(call);
      const q = {
        select: (cols: string) => { call.cols = cols; return q; },
        eq: (c: string, v: unknown) => { call.eq.push([c, v]); return q; },
        order: () => q,
        then: (ok: (v: unknown) => void) => ok({ data: [{ id: "c1" }], error: null }),
      };
      return q;
    },
  }),
}));

const params = (entity: string) => ({ params: Promise.resolve({ entity }) });

describe("conversation history over /api/data", () => {
  beforeEach(() => { calls.length = 0; });

  it("lists chats without their messages", async () => {
    const { GET } = await import("../route");
    await GET(new NextRequest("https://x.test/api/data/conversations"), params("conversations"));
    expect(calls[0].cols).toBe("id,title,project_id,updated_at");
    expect(calls[0].eq).toEqual([["user_id", "me@example.com"]]);
  });

  it("opens one chat in full, still scoped to the signed-in user", async () => {
    const { GET } = await import("../route");
    await GET(new NextRequest("https://x.test/api/data/conversations?id=c1"), params("conversations"));
    expect(calls[0].cols).toBe("*");
    expect(calls[0].eq).toEqual([["user_id", "me@example.com"], ["id", "c1"]]);
  });

  it("leaves other entities' list reads unchanged", async () => {
    const { GET } = await import("../route");
    await GET(new NextRequest("https://x.test/api/data/notes"), params("notes"));
    expect(calls[0].cols).toBe("*");
  });
});
