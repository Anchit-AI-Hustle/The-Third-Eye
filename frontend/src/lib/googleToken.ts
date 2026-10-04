import { getDb } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * Mint a fresh Google access token for a user from their stored (encrypted)
 * refresh token. Used by server-side jobs (e.g. Gmail scraping crons) that
 * run without a live session. Returns null when the user hasn't connected
 * Google, the database isn't configured, or the refresh fails.
 *
 * The refresh token is captured by the opt-in connect flow
 * (`/api/connect/google`), which requests the Gmail scopes — basic sign-in
 * does not grant them.
 */
export async function getGoogleAccessToken(
  email: string,
): Promise<{ accessToken: string; scope?: string } | null> {
  const sb = getDb();
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
  const sb = getDb();
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
 * Google scopes the Gmail and Calendar features need — exactly these, and the
 * same three must be the only scopes listed in Google Cloud Console → Data
 * Access, or verification fails on "scope discrepancy".
 *
 * NOT requested at sign-in — and now sign-in could not request them if it
 * wanted to: signing in is a mobile number and a 4-digit PIN (see lib/auth.ts)
 * and asks Google for nothing at all. These are requested only by
 * /api/connect/google, i.e. Settings → Connections, so connecting Google is
 * always a separate, explicit step.
 *
 * They were kept off the login screen even while Google WAS the login, because
 * gmail.readonly (restricted) and gmail.send (sensitive) both trigger Google's
 * verification review, and asking for them there makes that review a gate on
 * logging in at all — while the screen is unverified, only test users get in.
 *
 * This comment used to say the opposite, and said it after the rollback had
 * already shipped. Two call sites read it and repeated the claim, and
 * /api/connect/google/status was built on it - reporting "Connected" to every
 * signed-in user. A stale comment about who grants what is not a cosmetic
 * defect in this file.
 *
 * calendar.events is deliberately absent — nothing ever calls the Calendar API
 * to write ("add event" opens a calendar.google.com deep link, which needs no
 * OAuth scope at all). An unused restricted scope is exactly what a
 * verification reviewer flags, and there is nothing to demo it doing.
 *
 * Least privilege: calendar.events.readonly, not calendar.readonly — the app
 * only lists events on the primary calendar, never calendars or settings. The
 * Google Chat scopes are gone with Chat ingestion: they were needed only to
 * pull tasks from Chat spaces, which consumer Google accounts can't use, and
 * one of them was a second restricted scope.
 *
 * Console grouping (one justification box per group, see oauthJustifications.ts):
 *   Sensitive  — gmail.send, calendar.events.readonly
 *   Restricted — gmail.readonly
 */
export const INGESTION_SCOPE_LIST = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

/** Identity scopes. Requested by the connect flow, and by sign-in if Google is
 * ever restored as a provider (see lib/auth.ts). */
export const BASIC_SCOPE_LIST = ["openid", "email", "profile"] as const;

/**
 * Everything /api/connect/google asks for: the feature scopes plus identity.
 *
 * Identity is in there so the callback can record WHICH mailbox the grant belongs
 * to — the cron needs that to send someone their own reminders, and it can be
 * neither inferred from the identity key (a phone number since sign-in changed)
 * nor always read back from Gmail, because users/me/profile refuses a send-only
 * grant. openid/email are not restricted, so including them does not put this
 * screen behind OAuth verification.
 *
 * "connected" still means holding a FEATURE scope (see
 * /api/connect/google/status), so adding identity here cannot make an
 * identity-only grant look like a connection — the defect #313 fixed.
 */
export const CONNECT_SCOPES = [...BASIC_SCOPE_LIST, ...INGESTION_SCOPE_LIST].join(" ");

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
}

/** What a granted scope string actually permits. */
export function googleCapabilities(granted: string | undefined): GoogleCapabilities {
  return {
    gmailRead: hasGoogleScope(granted, "https://www.googleapis.com/auth/gmail.readonly"),
    gmailSend: hasGoogleScope(granted, "https://www.googleapis.com/auth/gmail.send"),
    // Grants made before the narrowing still carry calendar.readonly, which also reads events.
    calendarRead: hasGoogleScope(granted, "https://www.googleapis.com/auth/calendar.events.readonly")
      || hasGoogleScope(granted, "https://www.googleapis.com/auth/calendar.readonly"),
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
