import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { encrypt } from "@/lib/crypto";
import { resolveAuthSecret } from "@/lib/authSecret";
import { SIGNIN_SCOPES } from "@/lib/googleToken";

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

async function persistRefreshToken(email: string | undefined, refreshToken: string | undefined, scope: string | undefined) {
  if (!email || !refreshToken) return;
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
          // Everything is asked for here, in one consent screen, so signing in
          // with Google IS connecting Google — Gmail, Calendar and Chat work
          // immediately afterwards with no second step for the user to find.
          //
          // The cost: gmail.readonly and gmail.send are *restricted* scopes, so
          // until this OAuth client passes Google's verification review only
          // accounts on the project's test-user list can finish signing in.
          // That is a Google Cloud console state, not something code can change
          // — see docs/GOOGLE_OAUTH.md for the review and the rollback.
          scope: SIGNIN_SCOPES,
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
        if (account.id_token) {
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
