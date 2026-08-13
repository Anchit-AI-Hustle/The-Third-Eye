import { getAdminSupabase } from "@/lib/serverSupabase";
import { limitsFor, isUnlimited, type Tier } from "@/lib/entitlements";

// Recurrences the reminders cron (api/cron/dispatch) knows how to advance.
// Anything outside this set cannot be honoured, and saying so beats writing a
// row that never fires.
const RECURRENCES = new Set(["daily", "weekly", "monthly"]);
const TRIGGER_HOUR_UTC: Record<string, number> = { morning: 8, evening: 19 };

export function firstFireAt(recurrence: string, hourUtc: number | undefined, now = new Date()): string {
  const d = new Date(now);
  if (hourUtc !== undefined) {
    d.setUTCHours(hourUtc, 0, 0, 0);
    if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  }
  if (recurrence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (recurrence === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export interface AutomationInput {
  name?: string;
  trigger?: string;
  automation_action?: string;
  schedule?: string;
}

// Automations are stored as recurring reminders, which is the one scheduler
// this app actually runs: Vercel Cron hits /api/cron/dispatch every 5 minutes,
// which fires due rows over Gmail and web push and advances their recurrence.
export async function scheduleAutomation(
  ctx: { email?: string; tier: Tier },
  input: AutomationInput,
): Promise<string> {
  const name = (input.name ?? "").trim();
  const action = (input.automation_action ?? "").trim();
  const trigger = (input.trigger ?? "").trim().toLowerCase();
  const schedule = (input.schedule ?? "daily").trim().toLowerCase();

  if (!name || !action) return "I need a name and an action to set up an automation.";
  if (!RECURRENCES.has(schedule)) {
    return `I can run automations daily, weekly or monthly — not "${schedule}". Event triggers aren't wired to anything that would fire them, so I'd be promising something that never runs. Pick one of those three and I'll schedule it.`;
  }

  const sb = getAdminSupabase();
  if (!sb || !ctx.email) return "Automations need cloud sync — ask the user to connect Supabase in settings.";

  const limits = limitsFor(ctx.tier);
  if (!limits.recurringReminders) {
    return "Recurring automations are a JARVIS Premium feature. You can upgrade in Settings → Upgrade.";
  }
  if (!isUnlimited(limits.activeReminders)) {
    const { count } = await sb
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.email)
      .eq("status", "pending");
    if ((count ?? 0) >= limits.activeReminders) {
      return `You're at the ${limits.activeReminders}-item limit for scheduled items. Cancel one first, or upgrade for unlimited.`;
    }
  }

  const fireAt = firstFireAt(schedule, TRIGGER_HOUR_UTC[trigger]);
  const { data, error } = await sb
    .from("reminders")
    .insert({ user_id: ctx.email, title: name, body: action, fire_at: fireAt, recurrence: schedule })
    .select("id, fire_at")
    .single();
  if (error) return `Could not schedule the automation: ${error.message}`;

  return `### Automation scheduled\n\n- **Name**: ${name}\n- **Action**: ${action}\n- **Repeats**: ${schedule}\n- **First run**: ${new Date(data.fire_at).toUTCString()}\n\nIt will reach you by email and push, and shows up in your reminders (id: ${data.id}) if you want to cancel it.`;
}
