import webpush from "web-push";
import { getAdminSupabase } from "@/lib/serverSupabase";

let configured = false;

function ensureConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@jarvis.app";
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  }
  return true;
}

export async function sendPush(userId: string, title: string, body: string, url = "/assistant"): Promise<boolean> {
  if (!ensureConfigured()) return false;
  const sb = getAdminSupabase();
  if (!sb) return false;
  const { data } = await sb.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!data?.length) return false;

  const payload = JSON.stringify({ title, body, url });
  let anySent = false;
  await Promise.all(
    data.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        anySent = true;
      } catch (err: any) {
        // Prune dead subscriptions.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );
  return anySent;
}
