import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Sign-up and sign-in end to end on a real Postgres: the phone_users table, the
// auth_rate_limit_hit window and the phone_pin_attempt / phone_pin_ok lock
// functions together. TEST_DATABASE_URL=postgres://… npm test; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;
const phone = `+9198${String(Date.now()).slice(-8)}`;

describe.skipIf(!url)("phone + PIN sign-in against Postgres", () => {
  let enter: typeof import("@/lib/phoneAuth").enter;
  let db: NonNullable<ReturnType<typeof import("@/lib/db").getDb>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ enter } = await import("@/lib/phoneAuth"));
    db = (await import("@/lib/db")).getDb()!;
  });
  afterAll(async () => {
    await db.from("phone_users").delete().eq("phone", phone);
    await db.from("auth_rate_limit").delete().eq("k", phone);
  });

  it("signs a new number up, then signs it back in with its PIN", async () => {
    expect(await enter({ phone })).toMatchObject({ ok: false, reason: "need_name" });
    const made = await enter({ phone, name: "Test", pin: "4826" });
    expect(made).toMatchObject({ ok: true, created: true, user: { phone, name: "Test" } });
    expect(await enter({ phone })).toMatchObject({ ok: false, reason: "need_pin" });
    expect(await enter({ phone, pin: "4826" })).toMatchObject({ ok: true, created: false });
  });

  it("counts wrong PINs in the database and locks on the fifth", async () => {
    expect(await enter({ phone, pin: "0000" })).toMatchObject({ reason: "wrong_pin", left: 4 });
    // Concurrent guesses each spend a try: the row lock in phone_pin_attempt is what makes five mean five.
    const burst = await Promise.all([1, 2, 3].map(() => enter({ phone, pin: "0000" })));
    expect(burst.map((r) => (r.ok ? 0 : "left" in r ? r.left : -1)).sort()).toEqual([1, 2, 3]);
    expect(await enter({ phone, pin: "0000" })).toMatchObject({ ok: false, reason: "locked" });
    expect(await enter({ phone, pin: "4826" })).toMatchObject({ ok: false, reason: "locked" });
  });

  it("clears the lock and the count when phone_pin_ok runs", async () => {
    // The ten-per-number window has been spent above; this test is about the lock.
    await db.from("auth_rate_limit").delete().eq("k", phone);
    const { data } = await db.from("phone_users").select("id").eq("phone", phone).maybeSingle();
    expect((await db.rpc("phone_pin_ok", { p_id: data.id })).error).toBeNull();
    expect(await enter({ phone, pin: "4826" })).toMatchObject({ ok: true });
    expect(await enter({ phone, pin: "0000" })).toMatchObject({ reason: "wrong_pin", left: 4 });
  });
});
