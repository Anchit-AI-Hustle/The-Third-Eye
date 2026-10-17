import { describe, expect, it, vi } from "vitest";
import { BRIEFING_ID, notificationId, scheduleOnPhone, type LocalNotificationsPlugin } from "@/lib/localReminders";

const now = Date.parse("2026-10-17T12:00:00Z");
const rem = (id: string, fire_at: string, status = "pending") => ({ id, title: `Call ${id}`, body: null, fire_at, status });

function plugin(pending: number[] = [], display = "granted") {
  return {
    requestPermissions: vi.fn(async () => ({ display })),
    getPending: vi.fn(async () => ({ notifications: pending.map((id) => ({ id })) })),
    cancel: vi.fn(async () => {}),
    schedule: vi.fn(async () => ({})),
    addListener: vi.fn(async () => ({ remove() {} })),
  } satisfies LocalNotificationsPlugin;
}

describe("reminders and the morning briefing on the phone itself", () => {
  it("schedules upcoming reminders and a daily 8am briefing, replacing what was scheduled before", async () => {
    const p = plugin([123, BRIEFING_ID]);
    const n = await scheduleOnPhone(p, [
      rem("mom", "2026-10-17T15:00:00Z"),
      rem("past", "2026-10-17T11:00:00Z"),
      rem("done", "2026-10-18T09:00:00Z", "sent"),
    ], now);
    expect(n).toBe(1);
    expect(p.cancel).toHaveBeenCalledWith({ notifications: [{ id: 123 }, { id: BRIEFING_ID }] });
    const [{ notifications }] = p.schedule.mock.calls[0] as unknown as [{ notifications: Record<string, unknown>[] }];
    expect(notifications).toEqual([
      { id: notificationId("mom"), title: "Call mom", body: "Reminder", schedule: { at: new Date("2026-10-17T15:00:00Z"), allowWhileIdle: true }, extra: { url: "/assistant" } },
      { id: BRIEFING_ID, title: "Good morning", body: "Your briefing is ready: today's tasks, meetings and weather.", schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true }, extra: { url: "/assistant?ask=Give%20me%20my%20morning%20briefing" } },
    ]);
  });

  it("keeps ids stable and away from the briefing's id", () => {
    expect(notificationId("abc")).toBe(notificationId("abc"));
    expect(notificationId("abc")).not.toBe(notificationId("abd"));
    expect(notificationId("abc")).toBeGreaterThan(BRIEFING_ID);
    expect(notificationId("abc")).toBeLessThan(2 ** 31);
  });

  it("schedules nothing when notifications are off", async () => {
    const p = plugin([], "denied");
    expect(await scheduleOnPhone(p, [rem("mom", "2026-10-17T15:00:00Z")], now)).toBe(0);
    expect(p.schedule).not.toHaveBeenCalled();
  });

  it("stays under iOS's limit of 64 pending notifications", async () => {
    const p = plugin();
    const many = Array.from({ length: 100 }, (_, i) => rem(`r${i}`, new Date(now + (i + 1) * 60_000).toISOString()));
    expect(await scheduleOnPhone(p, many, now)).toBe(60);
  });
});
