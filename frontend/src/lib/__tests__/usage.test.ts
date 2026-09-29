import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const getDb = vi.fn();
vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

import { getTier, consume } from "../usage";

const ORIGINAL = process.env.ENFORCE_PREMIUM;

/** Minimal Supabase stand-in: profile row for getTier, rpc result for consume. */
function fakeSupabase(opts: {
  profile?: { subscription_tier?: string; subscription_status?: string } | null;
  rpcValue?: number;
  rpcError?: unknown;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: opts.profile ?? null }),
        }),
      }),
    }),
    rpc: async () => ({ data: opts.rpcValue ?? 0, error: opts.rpcError ?? null }),
  };
}

beforeEach(() => {
  getDb.mockReset();
  process.env.ENFORCE_PREMIUM = "1";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ENFORCE_PREMIUM;
  else process.env.ENFORCE_PREMIUM = ORIGINAL;
});

describe("getTier", () => {
  it("is free without an email", async () => {
    getDb.mockReturnValue(fakeSupabase({}));
    expect(await getTier(undefined)).toBe("free");
  });

  it("is free when Supabase is unconfigured", async () => {
    getDb.mockReturnValue(null);
    expect(await getTier("a@b.com")).toBe("free");
  });

  it("is free when the user has no profile row", async () => {
    getDb.mockReturnValue(fakeSupabase({ profile: null }));
    expect(await getTier("a@b.com")).toBe("free");
  });

  it("is premium only when the tier is premium AND the status is active", async () => {
    getDb.mockReturnValue(
      fakeSupabase({ profile: { subscription_tier: "premium", subscription_status: "active" } }),
    );
    expect(await getTier("a@b.com")).toBe("premium");
  });

  it("is free for a premium tier whose subscription lapsed", async () => {
    for (const status of ["canceled", "past_due", "unpaid", "incomplete", "paused"]) {
      getDb.mockReturnValue(
        fakeSupabase({ profile: { subscription_tier: "premium", subscription_status: status } }),
      );
      expect(await getTier("a@b.com")).toBe("free");
    }
  });

  it("is free for an active subscription that is not the premium tier", async () => {
    getDb.mockReturnValue(
      fakeSupabase({ profile: { subscription_tier: "free", subscription_status: "active" } }),
    );
    expect(await getTier("a@b.com")).toBe("free");
  });

  it("fails closed on an unrecognised tier value", async () => {
    getDb.mockReturnValue(
      fakeSupabase({ profile: { subscription_tier: "enterprise", subscription_status: "active" } }),
    );
    expect(await getTier("a@b.com")).toBe("free");
  });
});

describe("consume", () => {
  it("allows everything when enforcement is off, regardless of usage", async () => {
    process.env.ENFORCE_PREMIUM = "0";
    getDb.mockReturnValue(fakeSupabase({ rpcValue: 9999 }));
    const res = await consume("a@b.com", "chatPerDay");
    expect(res.allowed).toBe(true);
  });

  it("allows everything when Supabase is unconfigured", async () => {
    getDb.mockReturnValue(null);
    const res = await consume("a@b.com", "chatPerDay");
    expect(res.allowed).toBe(true);
  });

  it("allows an anonymous caller through rather than blocking", async () => {
    getDb.mockReturnValue(fakeSupabase({}));
    const res = await consume(undefined, "chatPerDay");
    expect(res.allowed).toBe(true);
  });

  it("skips metering entirely for an unlimited premium user", async () => {
    getDb.mockReturnValue(
      fakeSupabase({
        profile: { subscription_tier: "premium", subscription_status: "active" },
        rpcValue: 100000,
      }),
    );
    const res = await consume("a@b.com", "chatPerDay");
    expect(res.tier).toBe("premium");
    expect(res.allowed).toBe(true);
  });

  it("allows a free user up to and including the limit", async () => {
    const limit = 20; // free chatPerDay
    getDb.mockReturnValue(fakeSupabase({ profile: null, rpcValue: limit }));
    const res = await consume("a@b.com", "chatPerDay");
    expect(res.limit).toBe(limit);
    expect(res.used).toBe(limit);
    expect(res.allowed).toBe(true);
  });

  it("blocks a free user one past the limit", async () => {
    getDb.mockReturnValue(fakeSupabase({ profile: null, rpcValue: 21 }));
    const res = await consume("a@b.com", "chatPerDay");
    expect(res.allowed).toBe(false);
  });

  it("fails open when the counter errors — availability over strict metering", async () => {
    getDb.mockReturnValue(
      fakeSupabase({ profile: null, rpcValue: 9999, rpcError: { message: "boom" } }),
    );
    const res = await consume("a@b.com", "chatPerDay");
    expect(res.allowed).toBe(true);
  });

  it("meters web search on its own smaller limit", async () => {
    getDb.mockReturnValue(fakeSupabase({ profile: null, rpcValue: 11 }));
    const res = await consume("a@b.com", "webSearchPerDay");
    expect(res.limit).toBe(10);
    expect(res.allowed).toBe(false);
  });

  it("always reports the resolved tier and limits back to the caller", async () => {
    getDb.mockReturnValue(fakeSupabase({ profile: null, rpcValue: 1 }));
    const res = await consume("a@b.com", "chatPerDay");
    expect(res.tier).toBe("free");
    expect(res.limits.canSendEmail).toBe(false);
  });
});
