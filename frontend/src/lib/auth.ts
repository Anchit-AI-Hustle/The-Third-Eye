import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { resolveAuthSecret } from "@/lib/authSecret";
import { CONNECT_SCOPES, storeGoogleRefreshToken } from "@/lib/googleToken";

/**
 * Sign-in is Google only. The same consent also asks for Gmail and Calendar,
 * and the refresh token is stored when those scopes are actually granted, so
 * a confirmed send can go out through Gmail without a second connect step.
 * Declining the mail boxes still signs the person in; Settings → Connections
 * can grant them later. An identity-only grant never overwrites a working one
 * (`storeGoogleRefreshToken`).
 */
const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authOptions: NextAuthOptions = {
  providers: [
    ...(googleConfigured
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                scope: CONNECT_SCOPES,
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (profile) {
        const p = profile as { email?: string; name?: string; picture?: string };
        if (p.email) token.email = p.email;
        if (p.name) token.name = p.name;
        if (p.picture) token.picture = p.picture;
      }
      const email = typeof token.email === "string" ? token.email : "";
      if (account?.refresh_token && email) {
        await storeGoogleRefreshToken(email, account.refresh_token, account.scope, email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.picture === "string") session.user.image = token.picture;
      }
      return session;
    },
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
