import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = { kycVerified: true, subscriptionActive: true, privileged: false, plan: "basic" };
let user: { id: string } | null = { id: "+919999999999" };
vi.mock("@/lib/kolab-studio/db", () => ({
  getSessionUser: async () => user,
  getEntitlementContext: async () => ctx,
  getMyProfile: async () => ({ name: "Asha", handle: "asha", dob: "2000-01-01", pincode: "560001", city: "Bengaluru", state: "Karnataka", country: "India", website_url: null, privileged: false }),
}));
vi.mock("@/lib/kolab-studio/org", () => ({
  getActiveOrg: async () => ({ role: "owner", org: { id: "o1", name: "Asha Creates", type: "creator" } }),
  getMyMemberships: async () => [
    { role: "owner", org: { id: "o1", name: "Asha Creates", type: "creator" } },
    { role: "admin", org: { id: "o2", name: "Asha Store", type: "commerce" } },
  ],
}));
const provisioned: string[] = [];
vi.mock("@/lib/kolab-studio/provision", () => ({ ensureProvisioned: async (u: { id: string }) => { provisioned.push(u.id); } }));
const pillars = [{ id: "p1", name: "Real talk", role: "Builds trust", color: "var(--kolab-lime)", sort_order: 0 }];
const plan = [
  { id: "c1", pillar_id: "p1", format: "Reel · 30s", asset_type: "video", date: "2026-10-26", time: "19:30", hook: "Day one", caption: null, status: "posted", done: true, notes: null },
  { id: "c2", pillar_id: null, format: "", asset_type: "carousel", date: null, time: null, hook: "Tips", caption: null, status: "to_shoot", done: false, notes: null },
];
vi.mock("@/lib/kolab-studio/studio", () => ({
  getPillars: async () => pillars,
  getPlan: async () => plan,
  getDeals: async () => [{ id: "d1", active: true }, { id: "d2", active: false }],
  getSchedule: async () => [],
  getChannels: async () => [{ id: "ch1", platform: "instagram", handle: "asha", connected: true }],
}));

import { GET } from "@/app/api/kolab-studio/studio/route";

beforeEach(() => { user = { id: "+919999999999" }; ctx.kycVerified = true; });

describe("GET /api/kolab-studio/studio", () => {
  it("gives the phone apps the signed-in creator's studio, its derived views and the reference content", async () => {
    const { ok, data } = await (await GET()).json();
    expect(ok).toBe(true);
    expect(data.unlocked).toBe(true);
    expect(data.org).toEqual({ name: "Asha Creates", type: "creator" });
    expect(data.pillars[0]).toMatchObject({ id: "p1", color: "#c2f04a" });
    expect(data.assetMix.counts).toMatchObject({ video: 1, carousel: 1 });
    expect(data.tracker).toEqual({ posted: 1, total: 2, pct: 50 });
    expect(data.csv.split("\r\n")[1]).toContain('"Real talk"');
    expect(data.reference.statuses).toEqual(["to_shoot", "shot", "edited", "scheduled", "posted"]);
    expect(data.reference.channels.map((c: { k: string }) => c.k)).toContain("instagram");
    expect(data.reference.blueprints.length).toBeGreaterThan(0);
    expect(provisioned).toContain("+919999999999");
    expect(data.profile).toMatchObject({ name: "Asha", handle: "asha", city: "Bengaluru" });
    expect(data.profile.age).toBeGreaterThanOrEqual(26);
    expect(data.account).toEqual({ kycVerified: true, subscriptionActive: true, privileged: false, plan: "Basic", canPro: false });
    expect(data.analytics).toEqual({
      activeDeals: 1, linkedChannels: 1,
      byStatus: [
        { status: "to_shoot", label: "To shoot", n: 1 }, { status: "shot", label: "Shot", n: 0 }, { status: "edited", label: "Edited", n: 0 },
        { status: "scheduled", label: "Scheduled", n: 0 }, { status: "posted", label: "Posted", n: 1 },
      ],
    });
  });

  it("lists the user's workspaces and the types a new one can be", async () => {
    const { data } = await (await GET()).json();
    expect(data.activeOrgId).toBe("o1");
    expect(data.orgs).toEqual([
      { id: "o1", name: "Asha Creates", type: "creator", role: "owner" },
      { id: "o2", name: "Asha Store", type: "commerce", role: "admin" },
    ]);
    expect(data.packs.map((p: { type: string }) => p.type)).toEqual(["creator", "commerce", "local", "agency"]);
    expect(data.packs[0]).toMatchObject({ question: expect.any(String), icon: expect.any(String), verticals: expect.any(Array) });
  });

  it("shows nothing but the reason while the gate is closed", async () => {
    ctx.kycVerified = false;
    const { data } = await (await GET()).json();
    expect(data.unlocked).toBe(false);
    expect(data.reason).toBe("Verify your Aadhaar to unlock features");
    expect(data.plan).toEqual([]);
    // Profile, identity and channel linking come before the gate, as on the website's setup page.
    expect(data.profile.name).toBe("Asha");
    expect(data.account.kycVerified).toBe(false);
    expect(data.channels).toHaveLength(1);
  });

  it("refuses a signed-out caller", async () => {
    user = null;
    expect((await GET()).status).toBe(401);
  });
});
