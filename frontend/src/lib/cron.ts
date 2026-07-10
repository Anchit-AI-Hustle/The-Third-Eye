import type { NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/serverSupabase";

export type Sb = NonNullable<ReturnType<typeof getAdminSupabase>>;

/** Mirror of the /api/cron/dispatch auth: Bearer CRON_SECRET or ?secret=. */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev only
  const auth = req.headers.get("authorization");
  const q = new URL(req.url).searchParams.get("secret");
  return auth === `Bearer ${secret}` || q === secret;
}

/** Emails of users who have connected Google (via the opt-in connect flow). */
export async function connectedGoogleUsers(sb: Sb): Promise<string[]> {
  const { data } = await sb.from("google_tokens").select("user_id");
  return ((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id);
}

export async function alreadyProcessed(sb: Sb, userId: string, source: string, messageId: string): Promise<boolean> {
  const { data } = await sb
    .from("processed_messages")
    .select("message_id")
    .eq("user_id", userId).eq("source", source).eq("message_id", messageId)
    .maybeSingle();
  return !!data;
}

export async function markProcessed(sb: Sb, userId: string, source: string, messageId: string): Promise<void> {
  await sb.from("processed_messages").insert({ user_id: userId, source, message_id: messageId });
}
