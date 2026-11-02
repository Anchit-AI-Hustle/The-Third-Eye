import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ store: {} as Record<string, string>, saved: [] as Record<string, string>[] }));
vi.mock("@/lib/memoryStore", () => ({
  loadMemory: async () => ({ ...db.store }),
  saveMemory: async (_email: string, before: Record<string, string>, after: Record<string, string>) => {
    const changed = Object.entries(after).filter(([k, v]) => before[k] !== v);
    db.saved.push(Object.fromEntries(changed));
    return changed.length;
  },
}));
vi.mock("@/lib/googleToken", () => ({ getGoogleAccessToken: async () => null }));

beforeEach(() => { db.store = {}; db.saved = []; });

describe("an approved routine", () => {
  it("is saved to the user's memory exactly as shown", async () => {
    const { runConfirmedAction } = await import("@/lib/confirmedActions");
    const out = await runConfirmedAction("a@b.c", "manage_routines", { action: "save", name: "Focus Mode", steps: ["open gmail"] });
    expect(out.ok).toBe(true);
    expect(db.saved).toEqual([{ "routine:focus mode": JSON.stringify({ name: "Focus Mode", steps: ["open gmail"] }) }]);
  });

  it("is refused without steps, and nothing is written", async () => {
    const { runConfirmedAction } = await import("@/lib/confirmedActions");
    const out = await runConfirmedAction("a@b.c", "manage_routines", { action: "save", name: "Empty", steps: [] });
    expect(out.ok).toBe(false);
    expect(db.saved).toEqual([]);
  });
});
