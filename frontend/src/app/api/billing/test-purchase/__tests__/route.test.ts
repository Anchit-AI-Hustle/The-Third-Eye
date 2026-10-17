import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "owner@x.test";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
let balances: Record<string, number> = {};
const reasons: string[] = [];
async function rpc(fn: string, a: { p_user_id: string; p_amount: number; p_reason: string; p_gift: number }) {
  balances[a.p_user_id] ??= a.p_gift;
  if (fn === "refund_credits") { balances[a.p_user_id] += a.p_amount; reasons.push(a.p_reason); }
  return { data: balances[a.p_user_id], error: null };
}
vi.mock("@/lib/db", () => ({ getDb: () => ({ rpc }) }));

const { POST } = await import("@/app/api/billing/test-purchase/route");
const buy = (body: object) => POST(new Request("https://x.test", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => { email = "owner@x.test"; balances = {}; reasons.length = 0; vi.stubEnv("OWNER_EMAILS", "Owner@x.test,second@x.test"); });
afterEach(() => vi.unstubAllEnvs());

describe("test purchases", () => {
  it("adds a pack's credits and bonus to an owner account with no payment", async () => {
    const res = await buy({ bundle: "boost" });
    expect(await res.json()).toMatchObject({ ok: true, added: 1300 });
    expect(balances["owner@x.test"]).toBe(106 + 1300);
    expect(reasons).toEqual(["Test purchase: Boost pack (no payment)"]);
  });

  it("grants a plan's monthly credits", async () => {
    email = "second@x.test";
    expect(await (await buy({ tier: "pro" })).json()).toMatchObject({ ok: true, added: 7000 });
  });

  it("refuses everyone who is not an owner, and adds nothing", async () => {
    email = "someone@else.test";
    const res = await buy({ bundle: "mega" });
    expect(res.status).toBe(403);
    expect(balances).toEqual({});
  });

  it("rejects an unknown pack or the free plan", async () => {
    expect((await buy({ bundle: "nope" })).status).toBe(400);
    expect((await buy({ tier: "basic" })).status).toBe(400);
  });
});
