import { getDb } from "@/lib/db";
import { saveExtractedTasks } from "@/lib/tasks";
import { getTier } from "@/lib/usage";
import { isUnlimited, limitsFor, premiumEnforced } from "@/lib/entitlements";
import type { LifeAction, SavedAction } from "./types";

// Follow-ups heard in the Life Log become real tasks and reminders. Tasks go
// through the same deduped path as email tasks (one hash per day + title), so
// re-extracting a day never doubles them; open tasks are then worked by Task
// Autopilot, which flags the ones that need the person.

export function cleanActions(raw: unknown, date: string): LifeAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a): LifeAction[] => {
    const title = String(a?.title ?? "").trim().slice(0, 200);
    if (!title) return [];
    const when = String(a?.when ?? "");
    const t = /^\d{1,2}:\d{2}$/.test(when) ? `${date}T${when.padStart(5, "0")}` : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when) ? when.slice(0, 16) : undefined;
    return [{
      type: a?.type === "reminder" && t ? "reminder" : "task",
      title,
      detail: a?.detail ? String(a.detail).slice(0, 400) : undefined,
      steps: Array.isArray(a?.steps) ? a.steps.map((s: unknown) => String(s).slice(0, 200)).filter(Boolean).slice(0, 12) : undefined,
      when: t,
      needsYou: a?.needsYou === true,
    }];
  }).slice(0, 20);
}

// The browser's offset turns a local "YYYY-MM-DDTHH:MM" into an instant.
function toIso(local: string, tzOffsetMin: number): string {
  return new Date(Date.parse(`${local}:00Z`) + tzOffsetMin * 60_000).toISOString();
}

export async function saveLifeActions(email: string, date: string, actions: LifeAction[], tzOffsetMin: number): Promise<SavedAction[]> {
  const sb = getDb();
  if (!sb) return actions.map((a) => ({ ...a, saved: false, note: "Needs the database to save." }));

  const tasks = actions.filter((a) => a.type === "task");
  const out: SavedAction[] = [];
  for (const a of tasks) {
    const description = [
      a.detail,
      a.steps?.length ? a.steps.map((s) => `- [ ] ${s}`).join("\n") : "",
      a.needsYou ? "Needs you: the assistant can't finish this on its own." : "",
    ].filter(Boolean).join("\n\n") || null;
    const r = await saveExtractedTasks(
      { userId: email, sourceType: "LifeLog", sourceRefId: date, sourceDetail: `Heard in your Life Log on ${date}`, workspace: "personal" },
      [{ taskHeading: a.title, taskDescription: description, deadline: a.when ? toIso(a.when, tzOffsetMin) : null, urgency: a.needsYou ? "high" : "medium" }],
    );
    out.push({ ...a, saved: r.inserted + r.merged > 0, note: r.skipped ? "Already on your list." : undefined });
  }

  const reminders = actions.filter((a) => a.type === "reminder");
  if (!reminders.length) return out;
  const limits = limitsFor(premiumEnforced() ? await getTier(email) : "premium");
  for (const a of reminders) {
    const fireAt = toIso(a.when!, tzOffsetMin);
    if (Date.parse(fireAt) < Date.now()) { out.push({ ...a, saved: false, note: "That time has passed." }); continue; }
    const { data: dup } = await sb.from("reminders").select("id").eq("user_id", email).eq("title", a.title).eq("fire_at", fireAt).maybeSingle();
    if (dup) { out.push({ ...a, saved: true, note: "Already set." }); continue; }
    if (!isUnlimited(limits.activeReminders)) {
      const { count } = await sb.from("reminders").select("id", { count: "exact", head: true }).eq("user_id", email).eq("status", "pending");
      if ((count ?? 0) >= limits.activeReminders) { out.push({ ...a, saved: false, note: "Reminder limit reached on the free plan." }); continue; }
    }
    const { error } = await sb.from("reminders").insert({ user_id: email, title: a.title, fire_at: fireAt, recurrence: null });
    out.push({ ...a, saved: !error, note: error ? "Couldn't save the reminder." : undefined });
  }
  return out;
}
