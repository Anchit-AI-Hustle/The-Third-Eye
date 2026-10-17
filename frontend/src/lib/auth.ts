import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authUsesSecureCookies } from "@/lib/authCookies";
import { safeRedirectUrl } from "@/lib/authRedirect";
import { resolveAuthSecret } from "@/lib/authSecret";
import { PIN_LEN } from "@/lib/phone";
import { clientIp, enter } from "@/lib/phoneAuth";

/**
 * The only way in: a mobile number and a 4-digit PIN, checked on the server by
 * `enter` (scrypt hash, 5 tries then 15 minutes). An unknown number that arrives
 * with a name is a sign-up. The session key is the E.164 number, carried in
 * `session.user.email` because every table already keys on that field.
 * Gmail and Calendar are Settings → Connections, not sign-in.
 */
const PIN_RE = new RegExp(`^\\d{${PIN_LEN}}$`);

export const authOptions: NextAuthOptions = {
  useSecureCookies: authUsesSecureCookies(),
  providers: [
    CredentialsProvider({
      id: "phone",
      name: "Phone and PIN",
      credentials: {
        phone: { label: "Mobile number", type: "tel" },
        cc: { label: "Country code", type: "text" },
        name: { label: "Name", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials, req) {
        const pin = String(credentials?.pin ?? "");
        if (!PIN_RE.test(pin)) throw new Error(`Your PIN is ${PIN_LEN} numbers.`);
        const res = await enter({
          phone: credentials?.phone,
          cc: credentials?.cc,
          name: credentials?.name,
          pin,
          ip: clientIp(req?.headers as Record<string, string | undefined> | undefined),
        });
        if (res.ok) return { id: res.user.id, email: res.user.phone, name: res.user.name };
        throw new Error(res.error ?? "Could not sign in. Please try again.");
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.name === "string") session.user.name = token.name;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      return safeRedirectUrl(url, baseUrl);
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  secret: resolveAuthSecret(),
};
