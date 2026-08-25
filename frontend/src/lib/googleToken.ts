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

/**
 * Withdraw this user's Google grant: tell Google to revoke the refresh token,
 * then drop the stored row. Deleting our row alone leaves the grant live in the
 * user's Google account, so someone who deletes their account (or disconnects)
 * would still see us listed under "Third-party apps with account access".
 *
 * Revoking a refresh token invalidates every access token derived from it, so
 * one call ends the grant. Returns what happened for each half; the row is
 * cleared even if Google's endpoint is unreachable, because keeping a token we
 * were asked to forget is worse than a grant we can no longer use — the user
 * can then finish the job at myaccount.google.com/permissions.
 */
export async function revokeGoogleAccess(
  email: string,
): Promise<{ revoked: boolean; cleared: boolean; hadToken: boolean }> {
  const sb = getAdminSupabase();
  if (!sb) return { revoked: false, cleared: false, hadToken: false };

  const { data } = await sb
    .from("google_tokens")
    .select("refresh_token_enc")
    .eq("user_id", email)
    .maybeSingle();

  const enc = (data as { refresh_token_enc?: string } | null)?.refresh_token_enc;
  const refreshToken = enc ? decrypt(enc) : null;

  let revoked = false;
  if (refreshToken) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      });
      // Google answers 400 invalid_token for a grant the user already removed
      // from their side. That is the desired end state, not a failure.
      revoked = res.ok || res.status === 400;
    } catch {
      revoked = false;
    }
  }

  const { error } = await sb.from("google_tokens").delete().eq("user_id", email);
  return { revoked, cleared: !error, hadToken: !!refreshToken };
}

/**
 * Google scopes the Gmail/Calendar/Chat features need.
 *
 * Requested at sign-in (see lib/auth.ts) so signing in with Google grants
 * everything in one consent screen: the user is asked once, at that moment, and
 * nothing needs connecting afterwards. The standalone connect flow stays on as
 * a repair path for anyone who unticked a box on that screen.
 *
 * calendar.events is deliberately absent — nothing ever calls the Calendar API
 * to write ("add event" opens a calendar.google.com deep link, which needs no
 * OAuth scope at all). An unused restricted scope is exactly what a
 * verification reviewer flags, and there is nothing to demo it doing.
 */
export const INGESTION_SCOPE_LIST = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages.readonly",
] as const;

export const INGESTION_SCOPES = INGESTION_SCOPE_LIST.join(" ");

/** Identity scopes every sign-in needs regardless of feature access. */
export const BASIC_SCOPE_LIST = ["openid", "email", "profile"] as const;

/** The full set requested at sign-in: identity plus every feature scope. */
export const SIGNIN_SCOPES = [...BASIC_SCOPE_LIST, ...INGESTION_SCOPE_LIST].join(" ");

/**
 * Whether a granted scope string actually carries a scope.
 *
 * Asking for a scope is not the same as getting it: Google's consent screen
 * lets people untick individual boxes, and the token that comes back lists only
 * what they allowed. Reading what was granted — rather than assuming the
 * request succeeded — is what stops the assistant claiming it can send mail for
 * someone who declined that box.
 */
export function hasGoogleScope(granted: string | undefined, scope: string): boolean {
  if (!granted) return false;
  return granted.split(/\s+/).includes(scope);
}

export interface GoogleCapabilities {
  gmailRead: boolean;
  gmailSend: boolean;
  calendarRead: boolean;
  chatRead: boolean;
}

/** What a granted scope string actually permits. */
export function googleCapabilities(granted: string | undefined): GoogleCapabilities {
  return {
    gmailRead: hasGoogleScope(granted, "https://www.googleapis.com/auth/gmail.readonly"),
    gmailSend: hasGoogleScope(granted, "https://www.googleapis.com/auth/gmail.send"),
    calendarRead: hasGoogleScope(granted, "https://www.googleapis.com/auth/calendar.readonly"),
    chatRead: hasGoogleScope(granted, "https://www.googleapis.com/auth/chat.messages.readonly"),
  };
}

/** True when a grant is missing any feature scope, so a re-consent would help. */
export function needsReconsent(granted: string | undefined): boolean {
  return INGESTION_SCOPE_LIST.some((s) => !hasGoogleScope(granted, s));
}

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * The public origin of the current request (e.g. https://the-third-eye.anchit-tandon.com),
 * derived from the proxy headers Vercel sets. Used for OAuth redirect_uri so the
 * connect flow works without depending on NEXT_PUBLIC_APP_URL (which otherwise
 * falls back to localhost and breaks the Google callback).
 */
export function originFromRequest(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  // Only trust the forwarded Host when it matches a configured host — otherwise
  // an attacker-controlled Host header could steer the OAuth redirect off-site.
  // When no host is configured (e.g. local dev), fall back to trusting it.
  const allowed = allowedHosts();
  if (host && (allowed.length === 0 || allowed.includes(host.toLowerCase()))) {
    return `${proto}://${host}`;
  }
  return appBaseUrl();
}

// Hosts we're willing to build redirect origins for, from configured env URLs.
function allowedHosts(): string[] {
  const hosts = new Set<string>();
  for (const v of [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXTAUTH_URL]) {
    if (!v) continue;
    try { hosts.add(new URL(v).host.toLowerCase()); } catch { /* ignore */ }
  }
  return [...hosts];
}
