import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
let stored: string | null = null;
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: stored === null ? null : { value: stored }, error: null }),
        upsert: async (rows: { value: string }[]) => { stored = rows[0].value; return { error: null }; },
      };
      return q;
    },
  }),
}));

import { POST } from "@/app/api/user/sync/contacts/route";

const c = (id: string, name: string, phone?: string) => ({ id, name, phone, updated_at: "2026-10-17T00:00:00Z" });
const post = (body: unknown) => POST(new Request("https://x.test", { method: "POST", body: JSON.stringify(body) }) as never);
const saved = () => (JSON.parse(stored ?? "[]") as { id: string; name: string }[]).map((x) => x.name).sort();

beforeEach(() => { stored = JSON.stringify([c("1", "Priya", "+91 98100 00001"), c("2", "Ravi", "+91 98100 00002")]); });

describe("contacts sync", () => {
  it("a device with an older list adds to the cloud list instead of erasing it", async () => {
    await post({ contacts: [c("1", "Priya", "+91 98100 00001"), c("3", "Meera", "+91 98100 00003")] });
    expect(saved()).toEqual(["Meera", "Priya", "Ravi"]);
  });

  it("removes only what was deleted, and the same person is not stored twice", async () => {
    await post({ contacts: [c("9", "Priya S", "+919810000001")], removed: ["2"] });
    expect(saved()).toEqual(["Priya S"]);
  });
});
