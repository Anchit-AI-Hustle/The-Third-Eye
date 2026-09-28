import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { encrypt } from "@/lib/crypto";
import { resolveAuthSecret } from "@/lib/authSecret";
import { BASIC_SCOPE_LIST, INGESTION_SCOPE_LIST, hasGoogleScope } from "@/lib/googleToken";

/**
 * The FastAPI backend, when one is reachable.
 *
 * Deliberately no default. The old fallback was `http://backend:8000` — a
 * docker-compose service name that resolves only inside that network. On Vercel
 * it resolves nowhere, so every single sign-in fired a doomed request and paid
 * the connection failure before finishing. docker-compose sets BACKEND_URL
 * explicitly, so treating "unset" as "no backend" keeps local development
 * working and makes the hosted deployment stop calling into the void.
 */
const BACKEND_URL = process.env.BACKEND_URL?.trim();

/**
 * Store a refresh token for the background jobs - but only one that can do
 * something for them.
 *
 * THE BUG THIS FIXES
 *   Sign-in asks for identity only (see the provider config below). The refresh
 *   token it yields can mint nothing but identity, and this function used to
 *   store it anyway.
 *
 *   google_tokens holds ONE row per user, upserted on user_id, and it is the row
 *   the Gmail/Chat crons, /api/chat and /api/act all read. So a user who
 *   connected Google through /api/connect/google and then signed in again had
 *   their feature-scoped grant overwritten by an identity-only one: Gmail stops
 *   working, and the row looks healthier than ever because updated_at is fresh.
 *
 *   The same write drove the "Connected" badge in Settings, which read row
 *   presence. Every sign-in created a row, so every user was told Google was
 *   connected when no feature scope had ever been granted. (That endpoint now
 *   reads the scopes as well - two independent defects, one cause.)
 *
 *   Nothing needs an identity-only refresh token. Sessions are JWTs, and the
 *   only readers of this row want Gmail, Calendar or Chat. So the rule is: a
 *   grant that carries no feature scope does not belong in that row, and must
 *   not be allowed to displace one that does.
 */
async function persistRefreshToken(email: string | undefined, refreshToken: string | undefined, scope: string | undefined) {
  if (!email || !refreshToken) return;
  if (!INGESTION_SCOPE_LIST.some((s) => hasGoogleScope(scope, s))) return;
  const sb = getAdminSupabase();
  const enc = encrypt(refreshToken);
  if (!sb || !enc) return;
  await sb.from("google_tokens").upsert(
    { user_id: email, refresh_token_enc: enc, scope, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
}

async function refreshAccessToken(token: any) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: data.refresh_token ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // IDENTITY ONLY AT SIGN-IN. This is the rollback documented in
          // docs/GOOGLE_OAUTH.md, taken because the cost described below was
          // being paid in full.
          //
          // Sign-in used to request SIGNIN_SCOPES — identity plus Gmail,
          // Calendar and Chat — so that signing in with Google also connected
          // it, in one consent screen. gmail.readonly and gmail.send are
          // *restricted* scopes, and requesting them AT SIGN-IN makes Google's
          // verification review a gate on logging in at all: while the consent
          // screen is unverified, only accounts on the test-user list can get
          // in and everybody else is refused with AccessDenied.
          //
          // That is exactly what was happening. It worked for the owner, who is
          // a test user, and failed for every other person who tried — the same
          // shape as a link that opens for whoever is already signed in and
          // shows a wall to everyone else.
          //
          // Restricted-scope review needs a CASA assessment and takes weeks, so
          // until it clears, identity-only is the difference between an app
          // anyone can use and an app only its author can use.
          //
          // Gmail, Calendar and Chat are not lost. /api/connect/google requests
          // INGESTION_SCOPES on its own, and googleCapabilities() reads what was
          // actually granted, so a user without them is told the feature is not
          // connected rather than watching it fail. Restoring the one-screen
          // flow after verification is this line going back to SIGNIN_SCOPES.
          scope: BASIC_SCOPE_LIST.join(" "),
          // offline + a forced consent are what actually yield a refresh token.
          // Without prompt=consent Google omits it for anyone who authorized
          // before, and the crons (reminders, Gmail scrape) can only act while
          // the user is away if a refresh token was stored.
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : 0;
        await persistRefreshToken(
          (profile as { email?: string } | undefined)?.email ?? token.email ?? undefined,
          account.refresh_token,
          account.scope,
        );
        // No BACKEND_URL means no backend is deployed for this environment, so
        // there is nothing to exchange the token with. Skipping keeps sign-in
        // off a request that can only fail, and keeps the log honest: an error
        // per login for an absent optional service is noise that buries real
        // failures.
        if (account.id_token && BACKEND_URL) {
          // Sign-in must not fail just because the backend is unreachable, so
          // this stays non-fatal — but it is logged. It used to be swallowed by
          // a bare `catch {}`, which hid that the backend was rejecting every
          // one of these tokens (it decoded them HS256 with NEXTAUTH_SECRET,
          // while Google signs them RS256), so `backendToken` was never set for
          // anyone and nothing surfaced.
          try {
            const res = await fetch(`${BACKEND_URL}/api/v1/auth/session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: account.id_token }),
            });
            if (res.ok) {
              const data = await res.json();
              token.backendToken = data.access_token;
            } else {
              const detail = await res.text().catch(() => "");
              console.error(
                `auth: backend session exchange failed (HTTP ${res.status}). ` +
                  `Backend features will be unavailable. ${detail.slice(0, 500)}`,
              );
            }
          } catch (err) {
            console.error("auth: backend session exchange unreachable:", err);
          }
        }
        return token;
      }
      if (Date.now() < ((token.accessTokenExpires as number) ?? 0)) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (token.backendToken) (session as any).backendToken = token.backendToken;
      if (token.accessToken) (session as any).accessToken = token.accessToken;
      return session;
    },
    // Post-auth landing: always resolve to a proper in-app page. A bare
    // base-url redirect (which would otherwise show the marketing landing) goes
    // to the dashboard; same-origin callback URLs are preserved.
    async redirect({ url, baseUrl }) {
      if (url === baseUrl || url === `${baseUrl}/`) return `${baseUrl}/dashboard`;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/dashboard`;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  secret: resolveAuthSecret(),
};

declare module "next-auth" {
  interface Session {
    backendToken?: string;
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}
