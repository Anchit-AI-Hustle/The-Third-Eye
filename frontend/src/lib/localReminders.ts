// The phone app schedules reminders and a daily morning briefing as
// notifications on the phone itself (Capacitor LocalNotifications), so they
// arrive without Apple's paid push service and with no signal.

type Scheduled = { id: number; title: string; body: string; schedule: Record<string, unknown>; extra: { url: string } };

export interface LocalNotificationsPlugin {
  requestPermissions(): Promise<{ display: string }>;
  getPending(): Promise<{ notifications: { id: number }[] }>;
  cancel(o: { notifications: { id: number }[] }): Promise<void>;
  schedule(o: { notifications: Scheduled[] }): Promise<unknown>;
  addListener(event: "localNotificationActionPerformed", cb: (a: { notification: { extra?: { url?: string } } }) => void): Promise<{ remove(): void }>;
}

export interface ReminderRow { id: string; title: string; body: string | null; fire_at: string; status: string; recurrence: string | null }

// A repeating reminder repeats on the phone too, at its local time
// (weekday 1 is Sunday), so it keeps coming without a refresh.
function when(r: ReminderRow): Record<string, unknown> {
  const d = new Date(r.fire_at);
  const time = { hour: d.getHours(), minute: d.getMinutes() };
  if (r.recurrence === "daily") return { on: time, allowWhileIdle: true };
  if (r.recurrence === "weekly") return { on: { weekday: d.getDay() + 1, ...time }, allowWhileIdle: true };
  if (r.recurrence === "monthly") return { on: { day: d.getDate(), ...time }, allowWhileIdle: true };
  return { at: d, allowWhileIdle: true };
}
const repeats = (r: ReminderRow) => ["daily", "weekly", "monthly"].includes(r.recurrence ?? "");

export const BRIEFING_ID = 1;
/** Window event the chat sends after it creates, changes or cancels a reminder. */
export const REMINDERS_CHANGED = "jarvis:reminders";
// iOS keeps at most 64 pending notifications per app; one is the briefing.
const MAX_REMINDERS = 60;

export function localNotificationsPlugin(): LocalNotificationsPlugin | null {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { LocalNotifications?: LocalNotificationsPlugin } } }).Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins?.LocalNotifications ?? null : null;
}

export function notificationId(reminderId: string): number {
  let h = 0;
  for (const ch of reminderId) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % (2 ** 31 - 2)) + 2;
}

export async function scheduleOnPhone(p: LocalNotificationsPlugin, reminders: ReminderRow[], now = Date.now()): Promise<number> {
  if ((await p.requestPermissions()).display !== "granted") return 0;
  const { notifications: old } = await p.getPending();
  if (old.length) await p.cancel({ notifications: old.map(({ id }) => ({ id })) });

  const upcoming = reminders
    .filter((r) => r.status === "pending" && (repeats(r) || Date.parse(r.fire_at) > now))
    .sort((a, b) => Date.parse(a.fire_at) - Date.parse(b.fire_at))
    .slice(0, MAX_REMINDERS)
    .map((r): Scheduled => ({
      id: notificationId(r.id),
      title: r.title,
      body: r.body || "Reminder",
      schedule: when(r),
      extra: { url: "/assistant" },
    }));
  await p.schedule({
    notifications: [
      ...upcoming,
      {
        id: BRIEFING_ID,
        title: "Good morning",
        body: "Your briefing is ready: today's tasks, meetings and weather.",
        schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true },
        extra: { url: `/assistant?ask=${encodeURIComponent("Give me my morning briefing")}` },
      },
    ],
  });
  return upcoming.length;
}
