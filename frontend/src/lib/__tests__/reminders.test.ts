import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let rows: Row[] = [];
const logged: Row[] = [];

function reminders() {
  const filters: [string, string, unknown][] = [];
  let patch: Row | null = null;
  let want = false;
  const match = () => rows.filter((r) => filters.every(([op, k, v]) => (op === "eq" ? r[k] === v : String(r[k]) <= String(v))));
  const q = {
    select: () => { want = true; return q; },
    update: (p: Row) => { patch = p; return q; },
    eq: (k: string, v: unknown) => { filters.push(["eq", k, v]); return q; },
    lte: (k: string, v: unknown) => { filters.push(["lte", k, v]); return q; },
    limit: () => q,
    then: (ok: (v: unknown) => void) => {
      const hit = match();
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      ok({ data: patch && !want ? null : hit.map((r) => ({ ...r })), error: null });
    },
  };
  return q;
}

vi.mock("@/lib/db", () => ({}));
vi.mock("@/lib/crypto", () => ({ decrypt: () => null }));
vi.mock("@/lib/google", () => ({ accessTokenFromRefresh: async () => null, gmailAddressFor: async () => null, sendGmail: async () => false }));
vi.mock("@/lib/serverIdentity", () => ({ isEmailIdentity: () => true }));
let pushOk = true;
const pushes: string[] = [];
vi.mock("@/lib/push", () => ({ sendPush: async (_u: string, title: string) => { pushes.push(title); return pushOk; } }));
vi.mock("@/lib/whatsapp", () => ({ notifyWhatsApp: async () => false }));

const sb = {
  from: (t: string) => t === "reminders" ? reminders() : {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    insert: (r: Row) => { logged.push(r); return { select: () => ({ maybeSingle: async () => ({}) }) }; },
  },
} as never;

const past = new Date(Date.now() - 60_000).toISOString();
beforeEach(() => {
  pushOk = true;
  pushes.length = 0;
  logged.length = 0;
  rows = [
    { id: "a", user_id: "me@x.com", title: "Call mom", status: "pending", fire_at: past, recurrence: null },
    { id: "b", user_id: "other@x.com", title: "Theirs", status: "pending", fire_at: past, recurrence: "daily" },
  ];
});

describe("runReminders", () => {
  it("delivers only the signed-in user's due reminders when scoped", async () => {
    const { runReminders } = await import("@/lib/reminders");
    expect(await runReminders(sb, "me@x.com")).toMatchObject({ fired: 1 });
    expect(pushes).toEqual(["Call mom"]);
    expect(rows[0].status).toBe("sent");
    expect(rows[1].status).toBe("pending");
  });

  it("moves a recurring reminder to its next time", async () => {
    const { runReminders } = await import("@/lib/reminders");
    await runReminders(sb, "other@x.com");
    expect(new Date(rows[1].fire_at as string).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
  });

  it("does not send a reminder twice when two runs overlap", async () => {
    const { runReminders } = await import("@/lib/reminders");
    await Promise.all([runReminders(sb, "me@x.com"), runReminders(sb, "me@x.com")]);
    expect(pushes).toEqual(["Call mom"]);
  });

  it("keeps an undelivered reminder pending and retries it later", async () => {
    pushOk = false;
    const { runReminders } = await import("@/lib/reminders");
    expect(await runReminders(sb, "me@x.com")).toMatchObject({ fired: 0 });
    expect(rows[0].status).toBe("pending");
    expect(new Date(rows[0].fire_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(logged).toEqual([]);
  });
});
