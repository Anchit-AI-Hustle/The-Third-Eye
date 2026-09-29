import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Kolab Studio on the app's own sign-in and database, end to end against a real Postgres that
// `scripts/migrate.mjs` has been applied to: TEST_DATABASE_URL=postgres://… npm test.
//
// What moving off Supabase put at risk: every read used to be scoped by RLS as the signed-in
// user, and now the server connects as the owner. So besides the flows working, this checks
// that one user can neither see nor change another's rows.
const url = process.env.TEST_DATABASE_URL;
const stamp = Date.now() % 1e8;
const A = `+9199${String(stamp).padStart(8, "0")}`;
const B = `+9188${String(stamp).padStart(8, "0")}`;

let who: string | null = A;
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve(who ? { user: { email: who } } : null) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const json = (body: unknown, method = "POST") =>
  new Request("https://x.test/api", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe.skipIf(!url)("Kolab Studio on Postgres", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
    process.env.KOLAB_PRIVILEGED_NUMBERS = A;
  });
  afterAll(async () => {
    const { getDb } = await import("@/lib/db");
    const { eraseKolabUser } = await import("@/lib/kolab-studio/erase");
    for (const u of [A, B]) await eraseKolabUser(getDb()!, u);
  });

  it("uses the app session as the Kolab user", async () => {
    const { getSessionUser } = await import("@/lib/kolab-studio/db");
    expect(await getSessionUser()).toEqual({ id: A });
    who = null;
    expect(await getSessionUser()).toBeNull();
    who = A;
  });

  it("creates an org and resolves memberships for the session user only", async () => {
    const { POST } = await import("@/app/api/kolab-studio/org/create/route");
    const res = await POST(json({ type: "creator", name: "A's studio" }));
    expect(res.status).toBe(200);
    const { getMyMemberships, getActiveOrg } = await import("@/lib/kolab-studio/org");
    expect((await getMyMemberships()).map((m) => [m.role, m.org.name, m.org.type])).toEqual([["owner", "A's studio", "creator"]]);
    expect((await getActiveOrg())?.org.name).toBe("A's studio");
    who = B;
    expect(await getMyMemberships()).toEqual([]);
    who = A;
  });

  it("provisions once, privileged from the allow-list by the E.164 id", async () => {
    const { ensureProvisioned } = await import("@/lib/kolab-studio/provision");
    const { getEntitlementContext } = await import("@/lib/kolab-studio/db");
    await Promise.all([ensureProvisioned({ id: A }), ensureProvisioned({ id: A })]);
    await ensureProvisioned({ id: B });
    expect(await getEntitlementContext()).toEqual({ kycVerified: false, subscriptionActive: true, privileged: true, plan: "pro" });
    who = B;
    expect(await getEntitlementContext()).toEqual({ kycVerified: false, subscriptionActive: false, privileged: false, plan: null });
    who = A;
  });

  it("keeps the feature gate closed until KYC", async () => {
    const { POST } = await import("@/app/api/kolab-studio/studio/deals/route");
    expect((await POST(json({ brand: "Acme" }))).status).toBe(403);
    const { kolabDb } = await import("@/lib/kolab-studio/db");
    await kolabDb().from("kyc_verifications").update({ status: "verified" }).eq("user_id", A);
    expect((await POST(json({ brand: "Acme", code: "A10" }))).status).toBe(200);
  });

  it("runs the studio routes, scoped to the user", async () => {
    const pillars = await import("@/app/api/kolab-studio/studio/pillars/route");
    expect((await pillars.PUT(json({ pillars: [{ name: "Tips" }, { name: "BTS" }] }, "PUT"))).status).toBe(200);
    const plan = await import("@/app/api/kolab-studio/studio/plan/route");
    expect((await plan.POST(json({ generate: "week" }))).status).toBe(200);
    const schedule = await import("@/app/api/kolab-studio/studio/schedule/route");
    expect((await schedule.POST(json({ title: "Launch", date: "2026-10-01", channels: ["instagram", "youtube"] }))).status).toBe(200);

    const studio = await import("@/lib/kolab-studio/studio");
    const [ps, items, posts, deals] = await Promise.all([studio.getPillars(), studio.getPlan(), studio.getSchedule(), studio.getDeals()]);
    expect(ps.map((p) => p.name)).toEqual(["Tips", "BTS"]);
    expect(items).toHaveLength(7);
    expect(new Set(items.map((i) => i.pillar_id))).toEqual(new Set(ps.map((p) => p.id)));
    expect(items[0].date).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(posts[0].channels).toEqual(["instagram", "youtube"]);
    expect(deals.map((d) => d.code)).toEqual(["A10"]);

    // Renaming keeps the id, so plan items stay attached.
    expect((await pillars.PUT(json({ pillars: [{ id: ps[0].id, name: "Tips v2" }, { id: ps[1].id, name: "BTS" }] }, "PUT"))).status).toBe(200);
    expect((await studio.getPillars()).map((p) => [p.id, p.name])).toEqual([[ps[0].id, "Tips v2"], [ps[1].id, "BTS"]]);

    who = B;
    expect(await studio.getPlan()).toEqual([]);
    expect(await studio.getDeals()).toEqual([]);
    who = A;
  });

  it("does not let another user change A's rows by id", async () => {
    const { getSessionUser, kolabDb } = await import("@/lib/kolab-studio/db");
    const { getPlan } = await import("@/lib/kolab-studio/studio");
    const target = (await getPlan())[0];
    // Give B an open gate so the only thing stopping the write is the owner scope.
    await kolabDb().from("kyc_verifications").update({ status: "verified" }).eq("user_id", B);
    await kolabDb().from("subscriptions").update({ status: "active", plan: "basic" }).eq("user_id", B);
    who = B;
    expect(await getSessionUser()).toEqual({ id: B });
    const plan = await import("@/app/api/kolab-studio/studio/plan/route");
    await plan.PATCH(json({ id: target.id, notes: "pwned" }, "PATCH"));
    await plan.DELETE(new Request(`https://x.test/api?id=${target.id}`, { method: "DELETE" }));
    who = A;
    const after = (await getPlan()).find((i) => i.id === target.id);
    expect(after?.notes).toBeNull();
  });

  it("serves the public storefront by handle", async () => {
    const profile = await import("@/app/api/kolab-studio/profile/route");
    expect((await profile.POST(json({ handle: `@a${stamp}`, name: "Ada" }))).status).toBe(200);
    const { getPublicStorefront } = await import("@/lib/kolab-studio/storefront");
    const store = await getPublicStorefront(`a${stamp}`);
    expect(store).toMatchObject({ name: "Ada", handle: `a${stamp}` });
    expect(store!.deals.map((d) => d.code)).toEqual(["A10"]);
  });

  it("erases everything the user owns, and orgs left with no members", async () => {
    const { getDb } = await import("@/lib/db");
    const { eraseKolabUser } = await import("@/lib/kolab-studio/erase");
    expect(await eraseKolabUser(getDb()!, A)).toEqual([]);
    const k = getDb()!.schema("kolab");
    for (const t of ["profiles", "subscriptions", "kyc_verifications", "content_plan", "content_pillars", "deals", "scheduled_posts", "memberships"]) {
      expect((await k.from(t).select("user_id", { count: "exact", head: true }).eq("user_id", A)).count).toBe(0);
    }
    expect((await k.from("organizations").select("id", { count: "exact", head: true }).eq("created_by", A)).count).toBe(0);
    expect((await k.from("audit_log").select("id", { count: "exact", head: true }).eq("actor_id", A)).count).toBe(0);
  });
});
