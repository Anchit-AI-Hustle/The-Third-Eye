// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "next-auth/jwt";

let session: { user: { email: string; name?: string } } | null = null;
const store = { started: new Set<string>(), approved: new Map<string, string>(), claimed: new Set<string>() };
vi.mock("next-auth", () => ({ getServerSession: async () => session }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/authHandoff", async (orig) => ({
  ...(await orig<typeof import("@/lib/authHandoff")>()),
  startHandoff: async (_db: unknown, c: string) => { store.started.add(c); },
  approveHandoff: async (_db: unknown, c: string, e: string) => (store.started.has(c) && !store.approved.has(c) ? (store.approved.set(c, e), true) : false),
  claimHandoff: async (_db: unknown, c: string) => (store.approved.has(c) && !store.claimed.has(c) ? (store.claimed.add(c), store.approved.get(c)!) : null),
}));

const code = "c".repeat(64);
const { GET, POST } = await import("@/app/api/auth/handoff/route");
const { POST: APPROVE } = await import("@/app/api/auth/handoff/approve/route");
const approve = (origin = "https://app.test") => APPROVE(new Request("https://app.test/api/auth/handoff/approve", {
  method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: `code=${code}`,
}));

beforeEach(() => {
  session = null;
  store.started.clear(); store.approved.clear(); store.claimed.clear();
  vi.stubEnv("NEXTAUTH_SECRET", "s3cret");
  vi.stubEnv("NEXTAUTH_URL", "https://app.test");
});

describe("sign-in handoff routes", () => {
  it("starts a handoff only for a well-formed code", async () => {
    expect((await POST(new Request("https://app.test/api/auth/handoff", { method: "POST", body: JSON.stringify({ code: "x" }) }))).status).toBe(400);
    expect((await POST(new Request("https://app.test/api/auth/handoff", { method: "POST", body: JSON.stringify({ code }) }))).status).toBe(204);
    expect(store.started.has(code)).toBe(true);
  });

  it("needs a signed-in person, on this site, to approve", async () => {
    store.started.add(code);
    expect((await approve()).status).toBe(401);
    session = { user: { email: "a@x.test" } };
    expect((await approve("https://evil.test")).status).toBe(403);
    const res = await approve();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://app.test/auth/handoff?code=${code}&done=1`);
    expect(store.approved.get(code)).toBe("a@x.test");
  });

  it("gives the waiting app a session cookie for the approved account, once", async () => {
    store.started.add(code);
    const poll = () => GET(new Request(`https://app.test/api/auth/handoff?code=${code}`));
    expect(await (await poll()).json()).toEqual({ signedIn: false });
    store.approved.set(code, "a@x.test");
    const res = await poll();
    expect(await res.json()).toEqual({ signedIn: true });
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^__Secure-next-auth\.session-token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    const token = await decode({ token: cookie.split(";")[0].split("=")[1], secret: "s3cret" });
    expect(token?.email).toBe("a@x.test");
    expect(await (await poll()).json()).toEqual({ signedIn: false });
  });
});
