import { getAdminSupabase } from "@/lib/serverSupabase";
import { decrypt } from "@/lib/crypto";

/**
 * Mint a fresh Google access token for a user from their stored (encrypted)
 * refresh token. Used by server-side jobs (e.g. Gmail/Chat scraping crons) that
 * run without a live session. Returns null when the user hasn't connected
 * Google, Supabase isn't configured, or the refresh fails.
 *
 * The refresh token is captured by the opt-in connect flow
 * (`/api/connect/google`), which requests the Gmail/Chat scopes — basic sign-in
 * does not grant them.
 */
export async function getGoogleAccessToken(
  email: string,
): Promise<{ accessToken: string; scope?: string } | null> {
  const sb = getAdminSupabase();
  if (!sb) return null;

  const { data } = await sb
    .from("google_tokens")
    .select("refresh_token_enc, scope")
    .eq("user_id", email)
    .maybeSingle();

  const enc = (data as { refresh_token_enc?: string; scope?: string } | null)?.refresh_token_enc;
  if (!enc) return null;

  const refreshToken = decrypt(enc);
  if (!refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) return null;
  return { accessToken: json.access_token, scope: (data as { scope?: string } | null)?.scope };
}

/** Google scopes the ingestion features need — requested via the connect flow. */
export const INGESTION_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages.readonly",
].join(" ");

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
