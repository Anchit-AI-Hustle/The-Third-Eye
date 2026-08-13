import { beforeEach, describe, expect, it, vi } from "vitest";

import { firstFireAt, scheduleAutomation } from "@/lib/automations";

const inserted: Array<Record<string, unknown>> = [];
let pendingCount = 0;
let insertError: string | null = null;
let supabaseConfigured = true;

const sb = {
  from() {
    return {
      select() {
        return {
          eq() {
            return { eq: () => Promise.resolve({ count: pendingCount }) };
          },
        };
      },
      insert(row: Record<string, unknown>) {
        inserted.push(row);
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                insertError
                  ? { data: null, error: { message: insertError } }
                  : { data: { id: "rem_1", fire_at: row.fire_at }, error: null },
              ),
          }),
        };
      },
    };
  },
};

vi.mock("@/lib/serverSupabase", () => ({
  getAdminSupabase: () => (supabaseConfigured ? sb : null),
}));

const premium = { email: "user@example.com", tier: "premium" as const };

beforeEach(() => {
  inserted.length = 0;
  pendingCount = 0;
  insertError = null;
  supabaseConfigured = true;
});

const valid = { name: "Morning brief", automation_action: "Summarise my day", schedule: "daily" };

describe("what it refuses to promise", () => {
  it("will not register a schedule nothing can fire", async () => {
    const out = await scheduleAutomation(premium, { ...valid, schedule: "on_event" });
    expect(out).toContain("daily, weekly or monthly");
    expect(inserted).toEqual([]);
  });

  it("rejects a cron expression rather than pretending to honour it", async () => {
    const out = await scheduleAutomation(premium, { ...valid, schedule: "0 9 * * 1" });
    expect(inserted).toEqual([]);
    expect(out).toContain("Pick one of those three");
  });

  it("asks for the missing pieces instead of writing a half row", async () => {
    expect(await scheduleAutomation(premium, { name: "", automation_action: "x" })).toContain("name and an action");
    expect(await scheduleAutomation(premium, { name: "x", automation_action: "" })).toContain("name and an action");
    expect(inserted).toEqual([]);
  });

  it("says so when there is no database to persist into", async () => {
    supabaseConfigured = false;
    expect(await scheduleAutomation(premium, valid)).toContain("cloud sync");
  });

  it("does not silently swallow a write failure", async () => {
    insertError = "permission denied";
    const out = await scheduleAutomation(premium, valid);
    expect(out).toContain("Could not schedule");
    expect(out).toContain("permission denied");
  });
});

describe("plan limits", () => {
  it("gates recurring automations behind premium", async () => {
    const out = await scheduleAutomation({ email: "a@b.com", tier: "free" }, valid);
    expect(out).toContain("Premium");
    expect(inserted).toEqual([]);
  });

  it("lets a premium user through", async () => {
    const out = await scheduleAutomation(premium, valid);
    expect(out).toContain("Automation scheduled");
    expect(inserted).toHaveLength(1);
  });
});

describe("what actually gets persisted", () => {
  it("writes a recurring reminder row the cron will pick up", async () => {
    await scheduleAutomation(premium, valid);
    expect(inserted[0]).toMatchObject({
      user_id: "user@example.com",
      title: "Morning brief",
      body: "Summarise my day",
      recurrence: "daily",
    });
    expect(typeof inserted[0].fire_at).toBe("string");
  });

  it.each(["daily", "weekly", "monthly"])("stores %s as a recurrence the dispatcher understands", async (schedule) => {
    await scheduleAutomation(premium, { ...valid, schedule });
    expect(inserted[0].recurrence).toBe(schedule);
  });

  it("reports the first run time back to the user", async () => {
    const out = await scheduleAutomation(premium, valid);
    expect(out).toContain("First run");
    expect(out).toContain("rem_1");
  });
});

describe("first fire time", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");

  it("uses the next morning slot when one has already passed today", () => {
    expect(firstFireAt("daily", 8, now)).toBe("2026-03-11T08:00:00.000Z");
  });

  it("uses today's evening slot when it is still ahead", () => {
    expect(firstFireAt("daily", 19, now)).toBe("2026-03-10T19:00:00.000Z");
  });

  it("starts one interval out when no time of day was given", () => {
    expect(firstFireAt("daily", undefined, now)).toBe("2026-03-11T12:00:00.000Z");
    expect(firstFireAt("weekly", undefined, now)).toBe("2026-03-17T12:00:00.000Z");
    expect(firstFireAt("monthly", undefined, now)).toBe("2026-04-10T12:00:00.000Z");
  });

  it("never schedules into the past", () => {
    for (const hour of [0, 8, 12, 19, 23]) {
      expect(new Date(firstFireAt("daily", hour, now)).getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
