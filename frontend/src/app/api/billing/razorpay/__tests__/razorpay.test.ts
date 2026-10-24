import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY_ID = "rzp_test_key";
const SECRET = "test-key-secret-never-shown";
const HOOK_SECRET = "test-webhook-secret";

let email: string | null = "+919000090000";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

type Row = { order_id: string; user_id: string; pack: string; credits: number; amount_paise: number; status: string; payment_id: string | null };
let purchases: Map<string, Row>;
let balances: Record<string, number>;
let grants: string[];
async function rpc(fn: string, a: Record<string, string | number>) {
  const user = String(a.p_user_id);
  if (fn === "credit_balance") return { data: (balances[user] ??= Number(a.p_gift)), error: null };
  if (fn === "grant_razorpay_purchase") {
    const p = purchases.get(String(a.p_order_id));
    if (!p || p.status !== "created") return { data: -1, error: null };
    if ([...purchases.values()].some((x) => x.payment_id === a.p_payment_id)) return { data: null, error: { code: "23505", message: "duplicate" } };
    Object.assign(p, { status: "paid", payment_id: a.p_payment_id });
    balances[p.user_id] = (balances[p.user_id] ??= Number(a.p_gift)) + p.credits;
    grants.push(String(a.p_reason));
    return { data: balances[p.user_id], error: null };
  }
  throw new Error(`unexpected rpc ${fn}`);
}
const db = {
  rpc,
  from: () => ({
    insert: async (row: Omit<Row, "status" | "payment_id">) => { purchases.set(row.order_id, { status: "created", payment_id: null, ...row }); return { error: null }; },
    select: () => ({ eq: (_: string, v: string) => ({ maybeSingle: async () => ({ data: purchases.has(v) ? { ...purchases.get(v)! } : null, error: null }) }) }),
  }),
};
vi.mock("@/lib/db", () => ({ getDb: () => db }));

// Razorpay's API, in memory.
let payments: Record<string, { id: string; order_id: string; amount: number; currency: string; status: string }>;
let orderBodies: Record<string, unknown>[];
let apiStatus: number;
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  if (apiStatus !== 200) return new Response(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR" } }), { status: apiStatus });
  const p = new URL(url).pathname;
  if (p === "/v1/orders") {
    orderBodies.push(JSON.parse(String(init.body)));
    return Response.json({ id: `order_T${orderBodies.length}`, status: "created" });
  }
  const capture = p.match(/^\/v1\/payments\/(pay_\w+)\/capture$/);
  if (capture) return Response.json(Object.assign(payments[capture[1]], { status: "captured" }));
  const pay = p.match(/^\/v1\/payments\/(pay_\w+)$/);
  if (pay && payments[pay[1]]) return Response.json(payments[pay[1]]);
  return new Response("{}", { status: 404 });
});

const order = await import("@/app/api/billing/razorpay/order/route");
const verify = await import("@/app/api/billing/razorpay/verify/route");
const callback = await import("@/app/api/billing/razorpay/callback/route");
const webhook = await import("@/app/api/billing/razorpay/webhook/route");

const sign = (o: string, p: string) => createHmac("sha256", SECRET).update(`${o}|${p}`).digest("hex");
const post = (body: object) => new Request("https://app.test/x", { method: "POST", body: JSON.stringify(body) });
const start = async (body: object = { pack: "boost" }) => (await order.POST(post(body))).json();
const verifyWith = (body: object) => verify.POST(post(body));
const proof = (o: string, p: string) => ({ razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: sign(o, p) });
const paid = (id: string, order_id: string, amount = 29900, status = "captured") => { payments[id] = { id, order_id, amount, currency: "INR", status }; };
// Razorpay posts the redirect as an urlencoded form.
const form = (fields: Record<string, string>) =>
  callback.POST(new Request("https://app.test/api/billing/razorpay/callback", {
    method: "POST", body: new URLSearchParams(fields).toString(), headers: { "content-type": "application/x-www-form-urlencoded" },
  }));
const hook = (event: object, secret = HOOK_SECRET) => {
  const raw = JSON.stringify(event);
  return webhook.POST(new Request("https://app.test/hook", {
    method: "POST", body: raw, headers: { "x-razorpay-signature": createHmac("sha256", secret).update(raw).digest("hex") },
  }));
};
const USER = "+919000090000";
const GIFT = 106;

beforeEach(() => {
  email = USER;
  purchases = new Map();
  balances = {};
  grants = [];
  payments = {};
  orderBodies = [];
  apiStatus = 200;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RAZORPAY_KEY_ID", KEY_ID);
  vi.stubEnv("RAZORPAY_KEY_SECRET", SECRET);
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", HOOK_SECRET);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("creating an order", () => {
  it("charges the catalog amount, not one the client sends", async () => {
    const d = await start({ pack: "boost", amount: 100, credits: 999999 });
    expect(d).toEqual({ keyId: KEY_ID, orderId: "order_T1", amount: 29900, currency: "INR", pack: { id: "boost", label: "Boost", credits: 1300 } });
    expect(orderBodies[0]).toMatchObject({ amount: 29900, currency: "INR", notes: { user: USER, pack: "boost", credits: "1300" } });
    expect(String(orderBodies[0].receipt).length).toBeLessThanOrEqual(40);
    expect(purchases.get("order_T1")).toMatchObject({ user_id: USER, pack: "boost", credits: 1300, amount_paise: 29900, status: "created" });
    const auth = (fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from(`${KEY_ID}:${SECRET}`).toString("base64")}`);
  });

  it("refuses an unknown pack and a signed-out visitor", async () => {
    expect((await order.POST(post({ pack: "free" }))).status).toBe(400);
    email = null;
    expect((await order.POST(post({ pack: "boost" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a Razorpay 401 with a calm 500 and other provider errors with 502", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    apiStatus = 401;
    const r = await order.POST(post({ pack: "boost" }));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/Nothing was charged/);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
    apiStatus = 400;
    expect((await order.POST(post({ pack: "boost" }))).status).toBe(502);
    expect(purchases.size).toBe(0);
    log.mockRestore();
  });

  it("never puts the key secret in a response", async () => {
    const body = JSON.stringify(await start());
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain(HOOK_SECRET);
  });
});

describe("verifying a payment", () => {
  it("credits a good payment once, and a replay adds nothing", async () => {
    await start();
    paid("pay_A1", "order_T1");
    const first = await verifyWith(proof("order_T1", "pay_A1"));
    expect(await first.json()).toEqual({ ok: true, credited: true, balance: GIFT + 1300 });
    const again = await verifyWith(proof("order_T1", "pay_A1"));
    expect(await again.json()).toEqual({ ok: true, credited: false, balance: GIFT + 1300 });
    expect(grants).toEqual(["Bought Boost pack (Razorpay)"]);
    expect(purchases.get("order_T1")).toMatchObject({ status: "paid", payment_id: "pay_A1" });
  });

  it("captures an authorized payment before crediting it", async () => {
    await start();
    paid("pay_A2", "order_T1", 29900, "authorized");
    expect(await (await verifyWith(proof("order_T1", "pay_A2"))).json()).toMatchObject({ credited: true });
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/payments/pay_A2/capture") && i.method === "POST")).toBe(true);
  });

  it("gives 400 and credits nothing for missing fields, a bad signature, another order or the wrong amount", async () => {
    await start();
    await start({ pack: "spark" });
    paid("pay_B1", "order_T1");
    paid("pay_OTHER", "order_T2", 14900);
    paid("pay_CHEAP", "order_T1", 100);
    const cases = [
      { razorpay_order_id: "order_T1", razorpay_payment_id: "pay_B1" },
      { ...proof("order_T1", "pay_B1"), razorpay_signature: sign("order_T1", "pay_X") },
      proof("order_T1", "pay_OTHER"),
      proof("order_T1", "pay_CHEAP"),
      proof("order_T1", "pay_UNPAID"),
    ];
    payments.pay_UNPAID = { id: "pay_UNPAID", order_id: "order_T1", amount: 29900, currency: "INR", status: "failed" };
    for (const c of cases) expect((await verifyWith(c)).status).toBe(400);
    expect(grants).toEqual([]);
    expect(purchases.get("order_T1")!.status).toBe("created");
  });

  it("refuses someone else's order", async () => {
    await start();
    paid("pay_C1", "order_T1");
    email = "+919999900000";
    expect((await verifyWith(proof("order_T1", "pay_C1"))).status).toBe(400);
    expect(grants).toEqual([]);
  });
});

describe("redirect callback", () => {
  it("credits a paid return and sends the browser to #paid", async () => {
    await start();
    paid("pay_D1", "order_T1");
    email = null; // the cross-site POST carries no session cookie
    const r = await form(proof("order_T1", "pay_D1"));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("https://app.test/plans#paid");
    expect(balances[USER]).toBe(GIFT + 1300);
  });

  it("sends a failed or forged return to #unpaid and credits nothing", async () => {
    await start();
    const failed = await form({ "error[code]": "BAD_REQUEST_ERROR", "error[metadata]": JSON.stringify({ order_id: "order_T1" }) });
    expect(failed.headers.get("location")).toBe("https://app.test/plans#unpaid");
    paid("pay_D2", "order_T1");
    const forged = await form({ ...proof("order_T1", "pay_D2"), razorpay_signature: "0".repeat(64) });
    expect(forged.headers.get("location")).toBe("https://app.test/plans#unpaid");
    expect(grants).toEqual([]);
  });
});

describe("webhook", () => {
  const event = (name: string, payment: string, orderId: string) => ({ event: name, payload: { payment: { entity: { id: payment, order_id: orderId } } } });

  it("credits order.paid once, also when payment.captured and the redirect arrive too", async () => {
    await start();
    paid("pay_E1", "order_T1");
    expect(await (await hook(event("order.paid", "pay_E1", "order_T1"))).json()).toEqual({ ok: true, credited: true });
    expect(await (await hook(event("payment.captured", "pay_E1", "order_T1"))).json()).toEqual({ ok: true, credited: false });
    expect((await form(proof("order_T1", "pay_E1"))).headers.get("location")).toBe("https://app.test/plans#paid");
    expect(grants).toHaveLength(1);
    expect(balances[USER]).toBe(GIFT + 1300);
  });

  it("rejects a bad signature with 400 and credits nothing", async () => {
    await start();
    paid("pay_E2", "order_T1");
    expect((await hook(event("order.paid", "pay_E2", "order_T1"), "wrong-secret")).status).toBe(400);
    expect(grants).toEqual([]);
  });

  it("ignores other events and other apps' orders with 200", async () => {
    expect(await (await hook({ event: "refund.created", payload: {} })).json()).toEqual({ ok: true, ignored: "refund.created" });
    expect((await hook(event("order.paid", "pay_X", "order_NOTOURS"))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("client bundle", () => {
  it("never references the key or webhook secret", () => {
    for (const f of ["src/lib/billing/razorpayCheckout.ts", "src/components/billing/PlansClient.tsx"]) {
      const src = readFileSync(path.resolve(__dirname, "../../../../../..", f), "utf8");
      expect(src).not.toMatch(/RAZORPAY_(KEY_SECRET|WEBHOOK_SECRET)|@\/lib\/razorpay"/);
    }
  });
});
