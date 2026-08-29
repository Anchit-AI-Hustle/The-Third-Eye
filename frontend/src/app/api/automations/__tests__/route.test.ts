import { beforeEach, describe, expect, it, vi } from "vitest";

const SIGNED_IN = "user@example.com";

let sessionEmail: string | null = SIGNED_IN;
vi.mock("next-auth", () => ({
  getServerSession: () => Promise.resolve(sessionEmail ? { user: { email: sessionEmail } } : null),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

let reminders: Array<Record<string, unknown>> = [];
let logs: Array<Record<string, unknown>> = [];
let sbConfigured = true;

const sb = {
  from(table: string) {
    if (table === "reminders") {
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              in: () => ({
                order: () => Promise.resolve({ data: reminders, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "notification_log") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                order: () => Promise.resolve({ data: logs, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};

vi.mock("@/lib/serverSupabase", () => ({
  getAdminSupabase: () => (sbConfigured ? sb : null),
}));

async function get() {
  const { GET } = await import("@/app/api/automations/route");
  const res = await GET({} as any);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.resetModules();
  sessionEmail = SIGNED_IN;
  sbConfigured = true;
  reminders = [];
  logs = [];
});

describe("auth and config gates", () => {
  it("rejects an unauthenticated caller", async () => {
    sessionEmail = null;
    const { status } = await get();
    expect(status).toBe(401);
  });

  it("reports unconfigured storage without crashing", async () => {
    sbConfigured = false;
    const { status } = await get();
    expect(status).toBe(501);
  });
});

describe("what it returns", () => {
  it("returns an empty list when nothing is scheduled", async () => {
    const { body } = await get();
    expect(body.automations).toEqual([]);
  });

  it("shapes an automation row and joins its most recent run", async () => {
    reminders = [
      { id: "r1", title: "Morning brief", body: "Summarise my day", fire_at: "2026-09-01T08:00:00.000Z", recurrence: "daily", status: "pending" },
    ];
    logs = [
      { ref_id: "r1", channel: "email", status: "sent", created_at: "2026-08-31T08:00:00.000Z" },
    ];
    const { body } = await get();
    expect(body.automations).toEqual([
      {
        id: "r1",
        name: "Morning brief",
        action: "Summarise my day",
        fireAt: "2026-09-01T08:00:00.000Z",
        recurrence: "daily",
        status: "pending",
        lastRun: { channel: "email", status: "sent", at: "2026-08-31T08:00:00.000Z" },
      },
    ]);
  });

  it("reports no last run when nothing has fired yet", async () => {
    reminders = [
      { id: "r2", title: "Weekly digest", body: "Summarise my week", fire_at: "2026-09-07T08:00:00.000Z", recurrence: "weekly", status: "paused" },
    ];
    const { body } = await get();
    expect(body.automations[0].lastRun).toBeNull();
    expect(body.automations[0].status).toBe("paused");
  });
});
