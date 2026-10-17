// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

let session: { user: { email: string } } | null = null;
const filters: [string, unknown][] = [];
let row: { thumb: string } | null = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));
vi.mock("@/lib/db", () => ({
  getDb: () => {
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return { from: () => q };
  },
}));
const { GET } = await import("@/app/api/photos/thumb/route");
const get = (id: string) => GET(new Request(`https://app.test/api/photos/thumb?id=${encodeURIComponent(id)}`));

beforeEach(() => { session = null; row = null; filters.length = 0; });

describe("photo thumbnails", () => {
  it("serves only the signed-in person's own photo", async () => {
    session = { user: { email: "me@x.com" } };
    row = { thumb: Buffer.from("jpegbytes").toString("base64") };
    const res = await get("ABC/L0/001");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toMatch(/private/);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("jpegbytes");
    expect(filters).toEqual([["user_id", "me@x.com"], ["id", "ABC/L0/001"]]);
  });

  it("refuses without a session and 404s an unknown photo", async () => {
    expect((await get("x")).status).toBe(401);
    session = { user: { email: "me@x.com" } };
    expect((await get("x")).status).toBe(404);
  });
});
