import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Signatures are generated with the real SDK and verified by the real
// `constructEvent`, so these exercise Stripe's actual crypto rather than a
// stand-in that would pass whatever we handed it.

const SECRET = "whsec_test_secret";

const upserts: Array<{ table: string; row: Record<string, unknown> }> = [];
let upsertThrows = false;

const fakeSupabase = {
  from(table: string) {
    return {
      upsert(row: Record<string, unknown>) {
        if (upsertThrows) return Promise.reject(new Error("db down"));
        upserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    };
  },
};

let supabaseConfigured = true;
vi.mock("@/lib/serverSupabase", () => ({
  getAdminSupabase: () => (supabaseConfigured ? fakeSupabase : null),
}));

// A real Stripe client — only the customer lookup is stubbed, because that is
// the one path that would otherwise reach the network.
const stripe = new Stripe("sk_test_placeholder");
const retrieveCustomer = vi.fn();
(stripe.customers as unknown as { retrieve: unknown }).retrieve = retrieveCustomer;

let stripeConfigured = true;
vi.mock("@/lib/stripe", () => ({
  getStripe: () => (stripeConfigured ? stripe : null),
  appUrl: () => "http://localhost:3000",
  PRICES: { monthly: "", yearly: "" },
}));

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    body,
    headers,
  }) as never;
}

function signed(event: Record<string, unknown>, opts: { secret?: string; timestamp?: number } = {}) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? SECRET,
    timestamp: opts.timestamp,
  });
  return { payload, header };
}

async function callWebhook(payload: string, header?: string) {
  const { POST } = await import("../route");
  return POST(post(payload, header ? { "stripe-signature": header } : {}));
}

function checkoutEvent(over: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { id: "cs_1", metadata: { email: "user@example.com" }, customer: "cus_1", subscription: "sub_1", ...over } },
  };
}

function subscriptionEvent(type: string, over: Record<string, unknown> = {}) {
  return {
    id: "evt_2",
    type,
    data: {
      object: {
        id: "sub_1",
        status: "active",
        customer: "cus_1",
        metadata: { email: "user@example.com" },
        current_period_end: 1_800_000_000,
        ...over,
      },
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  upserts.length = 0;
  upsertThrows = false;
  supabaseConfigured = true;
  stripeConfigured = true;
  retrieveCustomer.mockReset();
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
});

describe("refusing anything it cannot trust", () => {
  it("rejects a request with no signature header", async () => {
    const res = await callWebhook(JSON.stringify(checkoutEvent()));
    expect(res.status).toBe(400);
    expect(upserts).toEqual([]);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const { payload, header } = signed(checkoutEvent(), { secret: "whsec_attacker" });
    const res = await callWebhook(payload, header);
    expect(res.status).toBe(400);
    expect(upserts).toEqual([]);
  });

  it("rejects a body altered after it was signed", async () => {
    const { header } = signed(checkoutEvent());
    // Same signature, different payload — the upgrade is redirected to someone else.
    const tampered = JSON.stringify(checkoutEvent({ metadata: { email: "attacker@example.com" } }));
    const res = await callWebhook(tampered, header);
    expect(res.status).toBe(400);
    expect(upserts).toEqual([]);
  });

  it("rejects a replay of an old but genuinely signed request", async () => {
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    const { payload, header } = signed(checkoutEvent(), { timestamp: hourAgo });
    const res = await callWebhook(payload, header);
    expect(res.status).toBe(400);
    expect(upserts).toEqual([]);
  });

  it("accepts a signature that is inside the tolerance window", async () => {
    const justNow = Math.floor(Date.now() / 1000) - 60;
    const { payload, header } = signed(checkoutEvent(), { timestamp: justNow });
    const res = await callWebhook(payload, header);
    expect(res.status).toBe(200);
  });

  it("does not process anything when billing is unconfigured", async () => {
    stripeConfigured = false;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await callWebhook(JSON.stringify(checkoutEvent()));
    expect(res.status).toBe(501);
    expect(upserts).toEqual([]);
  });

  it("does not claim success when the database is unreachable", async () => {
    supabaseConfigured = false;
    const { payload, header } = signed(checkoutEvent());
    const res = await callWebhook(payload, header);
    expect(res.status).toBe(501);
  });
});

describe("applying a verified event", () => {
  it("grants premium on a completed checkout", async () => {
    const { payload, header } = signed(checkoutEvent());
    const res = await callWebhook(payload, header);

    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("profiles");
    expect(upserts[0].row).toMatchObject({
      user_id: "user@example.com",
      subscription_tier: "premium",
      subscription_status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
  });

  it("falls back to client_reference_id when metadata has no email", async () => {
    const ev = checkoutEvent({ metadata: {}, client_reference_id: "ref@example.com" });
    const { payload, header } = signed(ev);
    await callWebhook(payload, header);
    expect(upserts[0].row).toMatchObject({ user_id: "ref@example.com" });
  });

  it("writes nothing when the event carries no way to identify a user", async () => {
    const ev = checkoutEvent({ metadata: {}, client_reference_id: null, customer_email: null });
    const { payload, header } = signed(ev);
    const res = await callWebhook(payload, header);
    expect(res.status).toBe(200);
    expect(upserts).toEqual([]);
  });

  it("keeps premium while a subscription is active", async () => {
    const { payload, header } = signed(subscriptionEvent("customer.subscription.updated"));
    await callWebhook(payload, header);
    expect(upserts[0].row).toMatchObject({
      subscription_tier: "premium",
      subscription_status: "active",
      current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
    });
  });

  it("treats a trial as premium", async () => {
    const { payload, header } = signed(subscriptionEvent("customer.subscription.updated", { status: "trialing" }));
    await callWebhook(payload, header);
    expect(upserts[0].row).toMatchObject({ subscription_tier: "premium", subscription_status: "trialing" });
  });

  it("drops to free when the subscription is cancelled", async () => {
    const { payload, header } = signed(subscriptionEvent("customer.subscription.deleted", { status: "canceled" }));
    await callWebhook(payload, header);
    expect(upserts[0].row).toMatchObject({ subscription_tier: "free", subscription_status: "canceled" });
  });

  it("drops to free when payment lapses", async () => {
    const { payload, header } = signed(subscriptionEvent("customer.subscription.updated", { status: "past_due" }));
    await callWebhook(payload, header);
    expect(upserts[0].row).toMatchObject({ subscription_tier: "free" });
  });

  it("reads current_period_end off the subscription item when it is not at the top level", async () => {
    const ev = subscriptionEvent("customer.subscription.updated", {
      current_period_end: undefined,
      items: { data: [{ current_period_end: 1_900_000_000 }] },
    });
    const { payload, header } = signed(ev);
    await callWebhook(payload, header);
    expect(upserts[0].row).toMatchObject({
      current_period_end: new Date(1_900_000_000 * 1000).toISOString(),
    });
  });

  it("looks the customer up when the subscription has no email in metadata", async () => {
    retrieveCustomer.mockResolvedValue({ id: "cus_1", email: "looked-up@example.com" });
    const { payload, header } = signed(subscriptionEvent("customer.subscription.updated", { metadata: {} }));
    await callWebhook(payload, header);
    expect(retrieveCustomer).toHaveBeenCalledWith("cus_1");
    expect(upserts[0].row).toMatchObject({ user_id: "looked-up@example.com" });
  });

  it("writes nothing when the customer lookup fails", async () => {
    retrieveCustomer.mockRejectedValue(new Error("no such customer"));
    const { payload, header } = signed(subscriptionEvent("customer.subscription.updated", { metadata: {} }));
    const res = await callWebhook(payload, header);
    expect(res.status).toBe(200);
    expect(upserts).toEqual([]);
  });

  it("ignores event types it does not handle", async () => {
    const { payload, header } = signed({ id: "evt_3", type: "invoice.paid", data: { object: {} } });
    const res = await callWebhook(payload, header);
    expect(res.status).toBe(200);
    expect(upserts).toEqual([]);
  });

  it("reports a failure rather than acknowledging an event it could not apply", async () => {
    // Stripe retries on a non-2xx. Swallowing a write failure would silently
    // drop the upgrade the customer just paid for.
    upsertThrows = true;
    const { payload, header } = signed(checkoutEvent());
    const res = await callWebhook(payload, header);
    expect(res.status).toBe(500);
  });
});
