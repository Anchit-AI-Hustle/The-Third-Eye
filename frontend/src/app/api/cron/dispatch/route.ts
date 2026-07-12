import type { NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { decrypt } from "@/lib/crypto";
import { accessTokenFromRefresh, sendGmail } from "@/lib/google";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fired by Vercel Cron. Sends due reminders + a once-daily task digest, over
// email (Gmail, on the user's behalf) and web push. No-ops cleanly when the
// service-role key / Google client / encryption key are unconfigured.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const sb = getAdminSupabase();
  if (!sb) return json({ error: "Supabase not configured" }, 501);

  const job = new URL(req.url).searchParams.get("job") ?? "all";
  const out: Record<string, unknown> = {};
  if (job === "all" || job === "reminders") out.reminders = await runReminders(sb);
  if (job === "all" || job === "digest") out.digest = await runDigest(sb);
  return json(out);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // allow in dev only
  // Header only — query-string secrets leak into logs/proxies. Vercel Cron
  // sends Authorization: Bearer <CRON_SECRET> automatically.
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Cache one access token per user across a run.
type Sb = NonNullable<ReturnType<typeof getAdminSupabase>>;

async function accessTokenFor(sb: Sb, cache: Map<string, string | null>, email: string): Promise<string | null> {
  if (cache.has(email)) return cache.get(email)!;
  const { data } = await sb.from("google_tokens").select("refresh_token_enc").eq("user_id", email).maybeSingle();
  const refresh = data?.refresh_token_enc ? decrypt(data.refresh_token_enc) : null;
  const token = refresh ? await accessTokenFromRefresh(refresh) : null;
  cache.set(email, token);
  return token;
}

async function runReminders(sb: Sb) {
  const now = new Date().toISOString();
  const { data: due } = await sb
    .from("reminders")
    .select("*")
    .eq("status", "pending")
    .lte("fire_at", now)
    .limit(200);
  if (!due?.length) return { fired: 0 };

  const cache = new Map<string, string | null>();
  let fired = 0;

  for (const r of due) {
    const subject = `⏰ Reminder: ${r.title}`;
    const html = `<div style="font-family:system-ui,sans-serif"><h2>${escapeHtml(r.title)}</h2>${r.body ? `<p>${escapeHtml(r.body)}</p>` : ""}<p style="color:#888;font-size:12px">— JARVIS</p></div>`;

    const token = await accessTokenFor(sb, cache, r.user_id);
    let emailed = false;
    if (token) emailed = await sendGmail(token, r.user_id, subject, html);
    const pushed = await sendPush(r.user_id, r.title, r.body ?? "Reminder", "/assistant");

    await logNotification(sb, r.user_id, "reminder", r.id, "email", emailed ? "sent" : "failed");
    if (pushed) await logNotification(sb, r.user_id, "reminder", r.id, "push", "sent");

    // Only advance the reminder once it actually reached the user through some
    // channel; otherwise leave it pending so the next run retries it.
    if (!(emailed || pushed)) continue;
    const next = nextOccurrence(r.fire_at, r.recurrence, now);
    if (next) {
      await sb.from("reminders").update({ fire_at: next }).eq("id", r.id);
    } else {
      await sb.from("reminders").update({ status: "sent", sent_at: now }).eq("id", r.id);
    }
    fired++;
  }
  return { due: due.length, fired };
}

async function runDigest(sb: Sb) {
  const today = new Date().toISOString().slice(0, 10);
  // One digest per user per day: only users with a stored token, skip if already sent today.
  const { data: users } = await sb.from("google_tokens").select("user_id").limit(500);
  if (!users?.length) return { sent: 0 };

  const cache = new Map<string, string | null>();
  let sent = 0;

  for (const u of users) {
    const email = u.user_id;
    const { data: already } = await sb
      .from("notification_log")
      .select("id")
      .eq("user_id", email)
      .eq("kind", "daily_digest")
      .eq("ref_id", today)
      .maybeSingle();
    if (already) continue;

    const { data: tasks } = await sb
      .from("tasks")
      .select("title, status, priority, due_date")
      .eq("user_id", email)
      .not("status", "in", "(done,cancelled)")
      .limit(50);
    const { data: goals } = await sb.from("goals").select("title, current, target, unit").eq("user_id", email).limit(20);

    const html = digestHtml(tasks ?? [], goals ?? [], today);
    const token = await accessTokenFor(sb, cache, email);
    const ok = token ? await sendGmail(token, email, `🗓️ Your JARVIS daily briefing — ${today}`, html) : false;
    await sendPush(email, "Daily briefing ready", `${(tasks ?? []).length} open tasks today`, "/dashboard");
    await logNotification(sb, email, "daily_digest", today, "email", ok ? "sent" : "failed");
    if (ok) sent++;
  }
  return { users: users.length, sent };
}

function digestHtml(tasks: any[], goals: any[], date: string): string {
  const overdue = tasks.filter((t) => t.due_date && t.due_date < date);
  const taskRows = tasks.length
    ? tasks.map((t) => `<li><b>[${t.priority}]</b> ${escapeHtml(t.title)}${t.due_date ? ` · due ${t.due_date}` : ""} · ${t.status}</li>`).join("")
    : "<li>No open tasks — clear runway.</li>";
  const goalRows = goals.length
    ? `<h3>Goals</h3><ul>${goals.map((g) => `<li>${escapeHtml(g.title)}: ${g.current}/${g.target} ${g.unit ?? ""}</li>`).join("")}</ul>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px">
    <h2>Good morning. Here's your day.</h2>
    <p style="color:#666">${overdue.length ? `<b>${overdue.length} overdue</b> · ` : ""}${tasks.length} open task(s)</p>
    <h3>Tasks</h3><ul>${taskRows}</ul>${goalRows}
    <p style="color:#888;font-size:12px">— JARVIS · reply in the app to act on any of these</p>
  </div>`;
}

async function logNotification(sb: Sb, userId: string, kind: string, refId: string, channel: string, status: string) {
  await sb.from("notification_log").insert({ user_id: userId, kind, ref_id: refId, channel, status }).select().maybeSingle();
}

function nextOccurrence(fireAt: string, recurrence: string | null, nowIso: string): string | null {
  if (!recurrence || recurrence === "none") return null;
  const step = (d: Date) => {
    if (recurrence === "daily") d.setUTCDate(d.getUTCDate() + 1);
    else if (recurrence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
    else if (recurrence === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
    else return false;
    return true;
  };
  const now = new Date(nowIso).getTime();
  const d = new Date(fireAt);
  // Skip past any missed intervals (cron downtime) so we don't re-fire on catch-up.
  for (let i = 0; i < 1000; i++) {
    if (!step(d)) return null;
    if (d.getTime() > now) return d.toISOString();
  }
  return d.toISOString();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
