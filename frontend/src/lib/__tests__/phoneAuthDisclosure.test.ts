import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the unauthenticated sign-in surface is allowed to give away, and what the
 * lockout counter has to guarantee.
 *
 * THE THREE THINGS PINNED HERE
 *   1. POST /api/auth/phone is reachable by anyone who can guess a number
 *      (middleware does not cover /api/*). It answers one bit — is this number
 *      registered — and must not return the account holder's NAME, which would
 *      turn a list of numbers into a list of people and hand a phisher "Welcome
 *      back, <name>". It also must not distinguish a locked account, which would
 *      confirm to an attacker that their lockout attack landed.
 *   2. A wrong PIN must be counted by the database in one statement. Counting it
 *      in application code let parallel guesses all read the same value and write
 *      the same one back, so N simultaneous attempts moved the counter by one and
 *      the lock never arrived — against a secret that is one of ten thousand.
 *   3. A PIN of the wrong shape must not be hashed. scrypt is the expensive part,
 *      and this path is unauthenticated.
 */

const rpc = vi.fn();
const updates: Record<string, unknown>[] = [];
let row: Record<string, unknown> | null = null;

const chain = (table: string) => ({
  select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
  update: (patch: Record<string, unknown>) => {
    if (table === "phone_users") updates.push(patch);
    return { eq: () => Promise.resolve({ error: null }) };
  },
  insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
});

vi.mock("@/lib/db", () => ({
  getDb: () => ({ from: (t: string) => chain(t), rpc: (...a: unknown[]) => rpc(...a) }),
}));

const PHONE = "+919876543210";
const PIN = "8305";

/** A row whose stored hash really is the PIN above, so verifyPin does real work. */
async function seedRow(overrides: Record<string, unknown> = {}) {
  const { hashPin } = await import("@/lib/phonePin");
  const h = hashPin(PIN);
  row = {
    id: "11111111-1111-4111-8111-111111111111",
    phone: PHONE,
    name: "Anchit",
    pin_hash: h.hash,
    pin_salt: h.salt,
    pin_tries: 0,
    locked_until: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  rpc.mockReset();
  updates.length = 0;
  // Every call is allowed unless a test says otherwise, and the fail counter
  // reports "one try used" unless a test says otherwise.
  rpc.mockImplementation((fn: string) =>
    fn === "auth_rate_limit_hit"
      ? Promise.resolve({ data: 1, error: null })
      : Promise.resolve({ data: [{ allowed: true, tries: 1, locked_until: null }], error: null }),
  );
  await seedRow();
});
afterEach(() => {
  row = null;
});

async function preflight(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/auth/phone/route");
  const res = await POST(
    new Request("https://example.com/api/auth/phone", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

describe("POST /api/auth/phone", () => {
  it("never returns the account holder's name", async () => {
    const { body } = await preflight({ phone: PHONE });
    expect(body).toEqual({ ok: true, exists: true });
    expect(JSON.stringify(body)).not.toContain("Anchit");
  });

  it("answers a locked account exactly as it answers an unlocked one", async () => {
    const open = await preflight({ phone: PHONE });
    await seedRow({ locked_until: new Date(Date.now() + 9e5).toISOString() });
    const locked = await preflight({ phone: PHONE });
    expect(locked).toEqual(open);
  });

  it("says a number is not registered without inventing an account", async () => {
    row = null;
    const { body } = await preflight({ phone: PHONE });
    expect(body).toEqual({ ok: true, exists: false });
  });

  it("refuses a number that is not a valid number at all", async () => {
    expect((await preflight({ phone: "12345" })).status).toBe(400);
  });

  it("rate-limits by caller once the window is spent", async () => {
    rpc.mockImplementation(() => Promise.resolve({ data: 999, error: null }));
    expect((await preflight({ phone: PHONE })).status).toBe(429);
  });
});

describe("the rate limit in front of the path", () => {
  it("refuses rather than allows when the limiter itself cannot run", async () => {
    // Failing open here would mean a missing function or a bad grant silently
    // removes the cap while lookups and scrypt carry on.
    rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: "boom" } }));
    const { enter } = await import("@/lib/phoneAuth");
    const res = await enter({ phone: PHONE, pin: PIN, ip: "203.0.113.9" });
    expect(res).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("spends the caller window before the number window, so an abusive caller cannot seed rows", async () => {
    // Each check writes a row keyed by what it counts, and auth_rate_limit has no
    // per-request ceiling of its own. Checking the number first meant a caller
    // cycling through numbers had already inserted a bucket per request by the
    // time the caller limit refused them.
    const buckets: string[] = [];
    rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn !== "auth_rate_limit_hit") {
        return Promise.resolve({ data: [{ allowed: true, tries: 1, locked_until: null }], error: null });
      }
      buckets.push(String(args.p_bucket));
      // Over the caller limit, under the number limit.
      return Promise.resolve({ data: args.p_bucket === "phone_ip" ? 999 : 1, error: null });
    });
    const { enter } = await import("@/lib/phoneAuth");
    const res = await enter({ phone: PHONE, pin: PIN, ip: "203.0.113.9" });
    expect(res).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(buckets).toEqual(["phone_ip"]);
  });

  it("limits on the number itself, which no header can change", async () => {
    const seen: string[] = [];
    rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn !== "auth_rate_limit_hit") return Promise.resolve({ data: [{ allowed: true, tries: 1, locked_until: null }], error: null });
      seen.push(String(args.p_bucket));
      return Promise.resolve({ data: 1, error: null });
    });
    const { enter } = await import("@/lib/phoneAuth");
    await enter({ phone: PHONE, pin: PIN, ip: "203.0.113.9" });
    expect(seen).toContain("phone_number");
  });

  it("keys the caller window on a value the caller cannot choose", async () => {
    const { clientIp } = await import("@/lib/phoneAuth");
    // Vercel's own single-valued header wins outright.
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" }))).toBe(
      "198.51.100.7",
    );
    // Otherwise the hop nearest our edge — the entries a client sent itself come
    // first, so reading the left-hand one gave a fresh window per request.
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
    // NULL, not a placeholder. "unknown" is a perfectly good bucket key, so on a
    // deployment whose proxy sets neither header every caller shared one window and
    // the sixtieth request in ten minutes locked everybody out.
    expect(clientIp(new Headers({}))).toBeNull();
    expect(clientIp(undefined)).toBeNull();
  });

  it("applies no caller window at all when there is no address, rather than one shared bucket", async () => {
    const buckets: string[] = [];
    rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn !== "auth_rate_limit_hit") {
        return Promise.resolve({ data: [{ allowed: true, tries: 1, locked_until: null }], error: null });
      }
      buckets.push(String(args.p_bucket));
      return Promise.resolve({ data: 1, error: null });
    });
    const { clientIp, enter } = await import("@/lib/phoneAuth");
    await enter({ phone: PHONE, pin: PIN, ip: clientIp(new Headers({})) });
    expect(buckets).toEqual(["phone_number"]);
  });
});

describe("spending a try", () => {
  async function attempt(pin: string) {
    const { enter } = await import("@/lib/phoneAuth");
    return enter({ phone: PHONE, pin, ip: "203.0.113.9" });
  }

  const order = () => rpc.mock.calls.map((c) => String(c[0]));

  it("claims the try in the database BEFORE hashing, so a burst cannot outrun it", async () => {
    // The row read earlier is a snapshot; acting on its locked_until let
    // concurrent requests all see an unlocked account and all spend a guess. A
    // shared timeline, because the ordering IS the property — asserting only
    // that both happened would pass for the broken order too.
    const timeline: string[] = [];
    rpc.mockImplementation((fn: string) => {
      timeline.push(`rpc:${fn}`);
      return fn === "auth_rate_limit_hit"
        ? Promise.resolve({ data: 1, error: null })
        : Promise.resolve({ data: [{ allowed: true, tries: 1, locked_until: null }], error: null });
    });
    const phonePin = await import("@/lib/phonePin");
    const real = phonePin.verifyPin;
    const spy = vi.spyOn(phonePin, "verifyPin").mockImplementation((...args) => {
      timeline.push("verifyPin");
      return real(...args);
    });

    await attempt("8306");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(timeline.indexOf("rpc:phone_pin_attempt")).toBeGreaterThan(-1);
    expect(timeline.indexOf("rpc:phone_pin_attempt")).toBeLessThan(timeline.indexOf("verifyPin"));
    // Never a locally computed count written to the row.
    expect(updates.filter((u) => "pin_tries" in u)).toHaveLength(0);
  });

  it("hands back the lock when the database refuses the attempt", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "auth_rate_limit_hit"
        ? Promise.resolve({ data: 1, error: null })
        : Promise.resolve({
            data: [{ allowed: false, tries: 0, locked_until: new Date(Date.now() + 9e5).toISOString() }],
            error: null,
          }),
    );
    const res = await attempt("8306");
    expect(res).toMatchObject({ ok: false, reason: "locked" });
  });

  it("does not check the PIN at all once the attempt is refused", async () => {
    const phonePin = await import("@/lib/phonePin");
    const spy = vi.spyOn(phonePin, "verifyPin");
    rpc.mockImplementation((fn: string) =>
      fn === "auth_rate_limit_hit"
        ? Promise.resolve({ data: 1, error: null })
        : Promise.resolve({ data: [{ allowed: false, tries: 0, locked_until: null }], error: null }),
    );
    await attempt(PIN);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses rather than granting a free guess if the counter cannot move", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "auth_rate_limit_hit"
        ? Promise.resolve({ data: 1, error: null })
        : Promise.resolve({ data: null, error: { message: "function does not exist" } }),
    );
    const res = await attempt("8306");
    expect(res).toMatchObject({ ok: false, reason: "locked" });
  });

  it("does not pay for scrypt on a PIN that cannot be right, but still spends the try", async () => {
    const phonePin = await import("@/lib/phonePin");
    const spy = vi.spyOn(phonePin, "verifyPin");

    await attempt("83");
    expect(spy).not.toHaveBeenCalled();
    expect(order()).toContain("phone_pin_attempt");

    // And the spy really does observe this call site — without this the
    // assertion above would pass for a spy that was never wired up at all.
    await attempt("8306");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("refuses the sign-in if the reset cannot be persisted, rather than leaving the count advanced", async () => {
    // The attempt has already spent a try. A correct PIN that leaves the counter
    // advanced means five good sign-ins in a row would lock the account — the
    // opposite of what a correct PIN should do.
    let attempts = 0;
    rpc.mockImplementation((fn: string) => {
      if (fn === "auth_rate_limit_hit") return Promise.resolve({ data: 1, error: null });
      if (fn === "phone_pin_ok") {
        attempts += 1;
        return Promise.resolve({ error: { message: "cannot reach" } });
      }
      return Promise.resolve({ data: [{ allowed: true, tries: 1, locked_until: null }], error: null });
    });
    const { enter } = await import("@/lib/phoneAuth");
    const res = await enter({ phone: PHONE, pin: PIN, ip: "203.0.113.9" });
    expect(res.ok).toBe(false);
    // Retried once for a transient blip before giving up.
    expect(attempts).toBe(2);
  });

  it("reports the lock, not '0 tries left', when the last allowed attempt is wrong", async () => {
    // The fifth failure now persists the lock in the same statement that allows
    // the attempt, dated from the guessing rather than from whoever tries next.
    const until = new Date(Date.now() + 9e5).toISOString();
    rpc.mockImplementation((fn: string) =>
      fn === "auth_rate_limit_hit"
        ? Promise.resolve({ data: 1, error: null })
        : Promise.resolve({ data: [{ allowed: true, tries: 5, locked_until: until }], error: null }),
    );
    const { enter } = await import("@/lib/phoneAuth");
    const res = await enter({ phone: PHONE, pin: "8306", ip: "203.0.113.9" });
    expect(res).toMatchObject({ ok: false, reason: "locked" });
    expect((res as { error: string }).error).toMatch(/minutes/);
  });

  it("still lets the last allowed attempt succeed if that PIN is the right one", async () => {
    // Allowed-and-locked must not mean refused: the fifth PIN may be correct, and
    // phone_pin_ok is what clears the lock it arrived with.
    const until = new Date(Date.now() + 9e5).toISOString();
    rpc.mockImplementation((fn: string) =>
      fn === "auth_rate_limit_hit"
        ? Promise.resolve({ data: 1, error: null })
        : fn === "phone_pin_ok"
          ? Promise.resolve({ error: null })
          : Promise.resolve({ data: [{ allowed: true, tries: 5, locked_until: until }], error: null }),
    );
    const { enter } = await import("@/lib/phoneAuth");
    const res = await enter({ phone: PHONE, pin: PIN, ip: "203.0.113.9" });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("phone_pin_ok", { p_id: expect.any(String) });
  });

  it("clears the count, the lock AND the escalation ladder on the right PIN", async () => {
    // Without the ladder reset, one bad afternoon would leave a real person on
    // 24-hour locks for ever.
    const { enter } = await import("@/lib/phoneAuth");
    const res = await enter({ phone: PHONE, pin: PIN, ip: "203.0.113.9" });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("phone_pin_ok", { p_id: expect.any(String) });
  });
});
