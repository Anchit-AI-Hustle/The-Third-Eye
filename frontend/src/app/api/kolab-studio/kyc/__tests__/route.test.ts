import { describe, expect, it, vi } from "vitest";

const inserts: string[] = [];
vi.mock("@/lib/kolab-studio/db", () => ({
  getSessionUser: async () => ({ id: "u1" }),
  kolabDb: () => ({ from: (t: string) => ({ insert: async () => { inserts.push(t); return {}; }, upsert: async () => { inserts.push(t); return {}; } }) }),
}));
vi.mock("@/lib/kolab-studio/audit", () => ({ audit: async () => {} }));

import { POST } from "@/app/api/kolab-studio/kyc/route";

describe("Aadhaar KYC without a licensed provider", () => {
  it("says it is unavailable and stores nothing, instead of claiming an OTP was sent", async () => {
    const res = await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ action: "initiate", aadhaar: "234567890123", consent: true }) }));
    expect(res.status).toBe(501);
    expect((await res.json()).error).toMatch(/isn't available yet/);
    expect(inserts).toEqual([]);
  });
});
