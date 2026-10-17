import { createRequire } from "node:module";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The sign-in rules end to end through the NextAuth "phone" provider, with a fake
// phone_users row whose phone_pin_attempt mirrors the SQL in
// 20261017200000_phone_pin_lock_15_minutes.sql.

const PHONE = "+919876543210";
const PIN = "8305";
const LOCK_MS = 15 * 60 * 1000;

let row: Record<string, unknown> | null = null;

function attempt(max: number) {
  if (!row) return { allowed: false, tries: 0, locked_until: null };
  const locked = row.locked_until ? new Date(row.locked_until as string) : null;
  if (locked && locked > new Date()) return { allowed: false, tries: 0, locked_until: row.locked_until };
  const tries = (row.pin_tries as number) + 1;
  if (tries >= max) {
    row.pin_tries = 0;
    row.locked_until = new Date(Date.now() + LOCK_MS).toISOString();
    return { allowed: true, tries: max, locked_until: row.locked_until };
  }
  row.pin_tries = tries;
  row.locked_until = null;
  return { allowed: true, tries, locked_until: null };
}

const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  if (fn === "auth_rate_limit_hit") return { data: 1, error: null };
  if (fn === "phone_pin_attempt") return { data: [attempt(args.p_max as number)], error: null };
  if (fn === "phone_pin_ok") {
    if (row) Object.assign(row, { pin_tries: 0, locked_until: null });
    return { data: null, error: null };
  }
  return { data: null, error: { message: "unknown rpc" } };
});

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: row }) }) }),
    }),
    rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
  }),
}));

type Authorize = (c: Record<string, string>, req: { headers: Record<string, string> }) => Promise<unknown>;

async function phoneProvider() {
  const { authOptions } = await import("@/lib/auth");
  const p = authOptions.providers[0] as unknown as { options: { id: string; authorize: Authorize } };
  return p.options;
}

async function signInWith(pin: string) {
  const { authorize } = await phoneProvider();
  return authorize({ phone: PHONE, cc: "+91", pin }, { headers: { "x-real-ip": "203.0.113.9" } });
}

beforeEach(async () => {
  vi.resetModules();
  rpc.mockClear();
  const { hashPin } = await import("@/lib/phonePin");
  const h = hashPin(PIN);
  row = {
    id: "11111111-1111-4111-8111-111111111111",
    phone: PHONE,
    name: "Test",
    pin_hash: h.hash,
    pin_salt: h.salt,
    pin_tries: 0,
    locked_until: null,
  };
});

describe("NextAuth config", () => {
  it("has exactly one provider, the phone + PIN one", async () => {
    const { authOptions } = await import("@/lib/auth");
    expect(authOptions.providers).toHaveLength(1);
    expect(authOptions.providers[0].type).toBe("credentials");
    expect((await phoneProvider()).id).toBe("phone");
  });

  it("lists only the phone provider and has no Google route", async () => {
    const { authOptions } = await import("@/lib/auth");
    // next-auth does not export ./core, so load the handler the route uses by path.
    const { AuthHandler } = createRequire(import.meta.url)(
      path.resolve(__dirname, "../../../node_modules/next-auth/core/index.js"),
    ) as { AuthHandler: (p: unknown) => Promise<{ body?: unknown; redirect?: string }> };
    const call = (action: string, providerId?: string) =>
      AuthHandler({
        req: { origin: "http://localhost:3000", method: "GET", action, providerId, headers: {}, query: {}, body: {}, cookies: {} },
        options: { ...authOptions, secret: "test-secret" },
      });

    expect(Object.keys((await call("providers")).body as object)).toEqual(["phone"]);
    expect(String((await call("signin", "google")).redirect ?? "")).not.toContain("accounts.google.com");
  });
});

describe("phone + PIN sign-in", () => {
  it("signs in with the right PIN", async () => {
    await expect(signInWith(PIN)).resolves.toEqual({ id: row!.id, email: PHONE, name: "Test" });
  });

  it("counts wrong PINs down, then locks on the fifth for 15 minutes", async () => {
    for (const left of [4, 3, 2, 1]) {
      await expect(signInWith("1357")).rejects.toThrow(`That PIN is not right. ${left} ${left === 1 ? "try" : "tries"} left.`);
    }
    await expect(signInWith("1357")).rejects.toThrow(/Too many wrong PINs\. Try again in 15 minutes\./);
    const until = new Date(row!.locked_until as string).getTime();
    expect(until - Date.now()).toBeGreaterThan(LOCK_MS - 5000);
    expect(until - Date.now()).toBeLessThanOrEqual(LOCK_MS);
    await expect(signInWith(PIN)).rejects.toThrow(/Too many wrong PINs/);
  });

  it("lets the right PIN in after the lock expires, and resets the count", async () => {
    row!.locked_until = new Date(Date.now() - 1000).toISOString();
    await expect(signInWith(PIN)).resolves.toMatchObject({ email: PHONE });
    expect(row!.pin_tries).toBe(0);
    expect(row!.locked_until).toBeNull();
  });

  it.each(["123", "12345", "12a4", ""])("refuses %j without spending a try", async (pin) => {
    await expect(signInWith(pin)).rejects.toThrow("Your PIN is 4 numbers.");
    expect(rpc).not.toHaveBeenCalledWith("phone_pin_attempt", expect.anything());
  });
});
