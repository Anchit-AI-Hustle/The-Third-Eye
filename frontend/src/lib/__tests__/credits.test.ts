import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WELCOME_CREDITS } from "@/lib/billing/plans";

let email: string | null = "u@x.test";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

let balances: Record<string, number> = {};
const ledger: { user: string; delta: number; reason: string }[] = [];
async function rpc(fn: string, a: { p_user_id: string; p_amount: number; p_reason: string; p_gift: number }) {
  balances[a.p_user_id] ??= a.p_gift;
  if (fn === "spend_credits") {
    if (balances[a.p_user_id] < a.p_amount) return { data: -1, error: null };
    balances[a.p_user_id] -= a.p_amount;
    ledger.push({ user: a.p_user_id, delta: -a.p_amount, reason: a.p_reason });
  }
  if (fn === "refund_credits") {
    balances[a.p_user_id] += a.p_amount;
    ledger.push({ user: a.p_user_id, delta: a.p_amount, reason: a.p_reason });
  }
  return { data: balances[a.p_user_id], error: null };
}
vi.mock("@/lib/db", () => ({ getDb: () => ({ rpc }) }));

const { chargedRoute, refundable, spendCredits } = await import("@/lib/credits");
const post = () => new Request("https://x.test/api", { method: "POST", body: "{}" });

beforeEach(() => { email = "u@x.test"; balances = {}; ledger.length = 0; });
afterEach(() => vi.unstubAllEnvs());

describe("credits", () => {
  it("gives a new account the sign-up gift and charges a creation from it", async () => {
    const res = await chargedRoute("music.generate", async () => Response.json({ ok: true }))(post());
    expect(res.status).toBe(200);
    expect(balances["u@x.test"]).toBe(WELCOME_CREDITS - 20);
  });

  it("refuses with 402 and does not run the creation when the balance is short", async () => {
    balances["u@x.test"] = 10;
    const run = vi.fn(async () => Response.json({ ok: true }));
    const res = await chargedRoute("video.render", run)(post());
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("This needs 50 credits and you have 10. Top up in Plans to keep creating.");
    expect(run).not.toHaveBeenCalled();
    expect(balances["u@x.test"]).toBe(10);
  });

  it("refunds a creation that failed", async () => {
    await chargedRoute("studio.text", async () => Response.json({ error: "x" }, { status: 503 }))(post());
    expect(balances["u@x.test"]).toBe(WELCOME_CREDITS);
    expect(ledger.map((e) => e.delta)).toEqual([-3, 3]);
  });

  it("refunds a 200 marked refundable, and a handler that throws", async () => {
    await chargedRoute("health.plan", async () => refundable(Response.json({ plan: null })))(post());
    await expect(chargedRoute("health.plan", async () => { throw new Error("boom"); })(post())).rejects.toThrow("boom");
    expect(balances["u@x.test"]).toBe(WELCOME_CREDITS);
  });

  it("never charges an owner account", async () => {
    vi.stubEnv("OWNER_EMAILS", "Boss@X.test, other@x.test");
    expect(await spendCredits("boss@x.test", "video.render")).toEqual({ ok: true, cost: 0, balance: null });
    expect(balances).toEqual({});
  });

  it("leaves a signed-out request to the route's own 401", async () => {
    email = null;
    const res = await chargedRoute("music.generate", async () => Response.json({ error: "Not authenticated" }, { status: 401 }))(post());
    expect(res.status).toBe(401);
    expect(balances).toEqual({});
  });
});
