import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { encrypt } from "@/lib/crypto";
import { resolveAuthSecret } from "@/lib/authSecret";

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
          // Basic sign-in only. Sensitive/restricted Google scopes
          // (gmail.*, calendar.*) force OAuth app verification before
          // non-test users can sign in, which blocks login. They are
          // re-added alongside the Gmail/Chat ingestion feature, when
          // restricted-scope verification is completed.
          scope: ["openid", "email", "profile"].join(" "),
          access_type: "offline",
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
          try {
            const res = await fetch(`${BACKEND_URL}/api/v1/auth/session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: account.id_token }),
            });
            if (res.ok) {
              const data = await res.json();
              token.backendToken = data.access_token;
            }
          } catch {}
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
