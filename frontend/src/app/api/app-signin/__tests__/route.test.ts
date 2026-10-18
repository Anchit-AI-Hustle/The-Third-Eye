// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

let session: { user: { email: string } } | null = null;
const approved = new Map<string, string>();
vi.mock("next-auth", () => ({ getServerSession: async () => session }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/authHandoff", () => ({
  startHandoff: async () => {},
  approveHandoff: async (_db: unknown, c: string, e: string) => (approved.set(c, e), true),
}));

const { GET } = await import("@/app/api/app-signin/route");
const open = () => GET(new Request("https://app.test/api/app-signin"));

beforeEach(() => { session = null; approved.clear(); });

describe("app sign-in", () => {
  it("sends a signed-out person straight to Google", async () => {
    const res = await open();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://app.test/auth/app");
    expect(approved.size).toBe(0);
  });

  it("hands a signed-in person's app a fresh approved code through its own URL scheme", async () => {
    session = { user: { email: "a@x.test" } };
    const res = await open();
    const html = await res.text();
    const code = /thethirdeye:\/\/auth\?code=([0-9a-f]{64})/.exec(html)?.[1];
    expect(code).toBeDefined();
    expect(approved.get(code!)).toBe("a@x.test");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain('http-equiv="refresh"');
    const again = /code=([0-9a-f]{64})/.exec(await (await open()).text())?.[1];
    expect(again).not.toBe(code);
  });
});
