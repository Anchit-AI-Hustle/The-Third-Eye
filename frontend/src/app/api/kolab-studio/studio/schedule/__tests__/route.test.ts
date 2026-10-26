import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Record<string, unknown>[] = [];
vi.mock("@/lib/kolab-studio/apiGuard", () => ({
  requireFeatureAccess: async () => ({
    ok: true,
    user: { id: "+919999999999" },
    db: { from: () => ({ insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null }; } }) },
  }),
}));
vi.mock("@/lib/kolab-studio/audit", () => ({ audit: async () => {} }));

import { POST } from "@/app/api/kolab-studio/studio/schedule/route";

const post = (body: unknown) => POST(new Request("http://x/api/kolab-studio/studio/schedule", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => { inserted.length = 0; });

describe("POST /api/kolab-studio/studio/schedule", () => {
  it("reads the entered date and time as IST, whatever the server's timezone", async () => {
    expect((await post({ title: "Launch", date: "2026-10-26", time: "19:30", channels: ["instagram"] })).status).toBe(200);
    expect(inserted[0].scheduled_at).toBe("2026-10-26T14:00:00.000Z");
  });

  it("takes a date alone as IST midnight", async () => {
    await post({ title: "Launch", date: "2026-10-26", channels: ["instagram"] });
    expect(inserted[0].scheduled_at).toBe("2026-10-25T18:30:00.000Z");
  });
});
