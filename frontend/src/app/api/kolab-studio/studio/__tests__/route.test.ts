import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = { kycVerified: true, subscriptionActive: true, privileged: false, plan: "basic" };
let user: { id: string } | null = { id: "+919999999999" };
vi.mock("@/lib/kolab-studio/db", () => ({
  getSessionUser: async () => user,
  getEntitlementContext: async () => ctx,
}));
vi.mock("@/lib/kolab-studio/org", () => ({
  getActiveOrg: async () => ({ role: "owner", org: { id: "o1", name: "Asha Creates", type: "creator" } }),
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
  getDeals: async () => [],
  getSchedule: async () => [],
  getChannels: async () => [],
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
  });

  it("shows nothing but the reason while the gate is closed", async () => {
    ctx.kycVerified = false;
    const { data } = await (await GET()).json();
    expect(data.unlocked).toBe(false);
    expect(data.reason).toBe("Verify your Aadhaar to unlock features");
    expect(data.plan).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    user = null;
    expect((await GET()).status).toBe(401);
  });
});
