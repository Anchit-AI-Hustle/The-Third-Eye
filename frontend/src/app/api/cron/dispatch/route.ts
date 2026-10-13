import type { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db";
import { sendGmail } from "@/lib/google";
import { sendPush } from "@/lib/push";
import { leadRecommendation } from "@/lib/digest";
import { dispatchDaily } from "@/lib/music/daily";
import { probeProviders } from "@/lib/llmCascade";
import { syncStaleChats } from "@/lib/chatTasks";
import { notifyWhatsApp } from "@/lib/whatsapp";
import { escapeHtml, logNotification, mailboxFor, runReminders, type MailboxCache } from "@/lib/reminders";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fired by Vercel Cron. Sends due reminders + a once-daily task digest, over
// email (Gmail, on the user's behalf) and web push, then starts each user's
// daily song (lib/music/daily.ts). No-ops cleanly when the
// service-role key / Google client / encryption key are unconfigured.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const sb = getDb();
  if (!sb) return json({ error: "Database not configured" }, 501);

  const job = new URL(req.url).searchParams.get("job") ?? "all";
  const out: Record<string, unknown> = {};
  if (job === "all" || job === "reminders") out.reminders = await runReminders(sb);
  if (job === "all" || job === "digest") out.digest = await runDigest(sb);
  if (job === "all" || job === "music") out.music = await dispatchDaily(sb);
  if (job === "all" || job === "providers") out.providers = await probeProviders();
  // Its own cron entry: up to 15 model calls would crowd the 60s budget of "all".
  if (job === "chat_tasks") out.chatTasks = await syncStaleChats(sb);
  return json(out);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // allow in dev only
  // Header only — query-string secrets leak into logs/proxies. Vercel Cron
  // sends Authorization: Bearer <CRON_SECRET> automatically.
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runDigest(sb: Db) {
  const today = new Date().toISOString().slice(0, 10);
  // One digest per user per day: only users with a stored token, skip if already sent today.
  const { data: users } = await sb.from("google_tokens").select("user_id").limit(500);
  if (!users?.length) return { sent: 0 };

  const cache: MailboxCache = new Map();
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
    const { token, to } = await mailboxFor(sb, cache, email);
    const ok = token && to
      ? await sendGmail(token, to, `🗓️ Your JARVIS daily briefing — ${today}`, html)
      : false;
    // The push is what actually reaches them, so lead with the recommendation
    // rather than a count they'd have to open the app to act on.
    const lead = leadRecommendation(tasks ?? [], goals ?? [], today);
    await sendPush(
      email,
      "Daily briefing ready",
      lead ? lead.text : `${(tasks ?? []).length} open tasks today`,
      "/dashboard",
    );
    const top = (tasks ?? []).slice(0, 5).map((t) => `• ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("\n");
    const whatsapped = await notifyWhatsApp(email, `🗓️ Daily briefing — ${today}\n${lead ? `${lead.text}\n` : ""}${top || "No open tasks — clear runway."}`);
    await logNotification(sb, email, "daily_digest", today, "email", ok ? "sent" : "failed");
    if (whatsapped) await logNotification(sb, email, "daily_digest", today, "whatsapp", "sent");
    if (ok || whatsapped) sent++;
  }
  return { users: users.length, sent };
}

function digestHtml(tasks: any[], goals: any[], date: string): string {
  const overdue = tasks.filter((t) => t.due_date && t.due_date < date);
  const lead = leadRecommendation(tasks, goals, date);
  const taskRows = tasks.length
    ? tasks.map((t) => `<li><b>[${t.priority}]</b> ${escapeHtml(t.title)}${t.due_date ? ` · due ${t.due_date}` : ""} · ${t.status}</li>`).join("")
    : "<li>No open tasks — clear runway.</li>";
  const goalRows = goals.length
    ? `<h3>Goals</h3><ul>${goals.map((g) => `<li>${escapeHtml(g.title)}: ${g.current}/${g.target} ${g.unit ?? ""}</li>`).join("")}</ul>`
    : "";
  const leadBlock = lead
    ? `<p style="margin:16px 0;padding:14px 16px;background:#f3f6fa;border-left:3px solid #4FC3F7;border-radius:4px;font-size:15px">${lead.html}</p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px">
    <h2>Good morning. Here's your day.</h2>
    <p style="color:#666">${overdue.length ? `<b>${overdue.length} overdue</b> · ` : ""}${tasks.length} open task(s)</p>
    ${leadBlock}
    <h3>Tasks</h3><ul>${taskRows}</ul>${goalRows}
    <p style="color:#888;font-size:12px">— JARVIS · reply in the app to act on any of these</p>
  </div>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
