import type { Db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { accessTokenFromRefresh, gmailAddressFor, sendGmail } from "@/lib/google";
import { isEmailIdentity } from "@/lib/serverIdentity";
import { sendPush } from "@/lib/push";
import { notifyWhatsApp } from "@/lib/whatsapp";

// Cache one access token, and one delivery address, per user across a run.
type Mailbox = { token: string | null; to: string | null };
export type MailboxCache = Map<string, Mailbox>;

const RETRY_MS = 10 * 60_000;

// THE USER ID IS NOT ALWAYS AN ADDRESS. It is whatever sign-in put in
// session.user.email, and under phone sign-in that is an E.164 number — so
// addressing mail To: it produced messages to "+919876543210" that Gmail
// refused. The recipient here is always the user's own mailbox and we hold a
// token for it, so when the id is not an email the mailbox is asked its name.
export async function mailboxFor(sb: Db, cache: MailboxCache, userId: string): Promise<Mailbox> {
  const hit = cache.get(userId);
  if (hit) return hit;
  const { data } = await sb
    .from("google_tokens")
    .select("refresh_token_enc, email")
    .eq("user_id", userId)
    .maybeSingle();
  const refresh = data?.refresh_token_enc ? decrypt(data.refresh_token_enc) : null;
  const token = refresh ? await accessTokenFromRefresh(refresh) : null;
  // The address recorded when they connected is the reliable one. Asking Gmail
  // is the fallback for grants stored before that column existed, and it only
  // works on a scope that can read the mailbox — getProfile refuses a send-only
  // grant, which is why the stored value comes first.
  const to = isEmailIdentity(userId)
    ? userId
    : (data?.email as string | undefined) || (token ? await gmailAddressFor(token) : null);
  const box: Mailbox = { token, to };
  cache.set(userId, box);
  return box;
}

/** Sends every due reminder (or only one user's), advancing each that reached the user. */
export async function runReminders(sb: Db, userId?: string) {
  const now = new Date().toISOString();
  let q = sb.from("reminders").select("*").eq("status", "pending").lte("fire_at", now);
  if (userId) q = q.eq("user_id", userId);
  const { data: due } = await q.limit(200);
  if (!due?.length) return { fired: 0 };

  const cache: MailboxCache = new Map();
  let fired = 0;

  for (const r of due) {
    // Claim the row first: the cron and an open tab can both find it due, and
    // only the run whose update still matched this fire_at sends it. Pushing
    // fire_at out (rather than a "sending" status) means a run that dies here
    // leaves it to be retried, not stuck.
    const { data: claimed } = await sb.from("reminders").update({ fire_at: new Date(Date.now() + RETRY_MS).toISOString() })
      .eq("id", r.id).eq("status", "pending").eq("fire_at", r.fire_at).select("id");
    if (!claimed?.length) continue;

    const subject = `⏰ Reminder: ${r.title}`;
    const html = `<div style="font-family:system-ui,sans-serif"><h2>${escapeHtml(r.title)}</h2>${r.body ? `<p>${escapeHtml(r.body)}</p>` : ""}<p style="color:#888;font-size:12px">- JARVIS</p></div>`;

    const { token, to } = await mailboxFor(sb, cache, r.user_id);
    const emailed = token && to ? await sendGmail(token, to, subject, html) : false;
    const pushed = await sendPush(r.user_id, r.title, r.body ?? "Reminder", "/assistant");
    const whatsapped = await notifyWhatsApp(r.user_id, `⏰ Reminder: ${r.title}${r.body ? `\n${r.body}` : ""}`);

    if (token && to) await logNotification(sb, r.user_id, "reminder", r.id, "email", emailed ? "sent" : "failed");
    if (pushed) await logNotification(sb, r.user_id, "reminder", r.id, "push", "sent");
    if (whatsapped) await logNotification(sb, r.user_id, "reminder", r.id, "whatsapp", "sent");

    // Only advance the reminder once it actually reached the user through some
    // channel; otherwise the claim's later fire_at is the retry.
    if (!(emailed || pushed || whatsapped)) continue;
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

export async function logNotification(sb: Db, userId: string, kind: string, refId: string, channel: string, status: string) {
  await sb.from("notification_log").insert({ user_id: userId, kind, ref_id: refId, channel, status }).select().maybeSingle();
}

export function nextOccurrence(fireAt: string, recurrence: string | null, nowIso: string): string | null {
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

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
