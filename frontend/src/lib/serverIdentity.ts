import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bearerFrom, emailForToken, type GatewayScope } from "@/lib/gatewayAuth";
import type { AgentSource } from "@/lib/agentGuard";

export interface Identity {
  email?: string;
  source: AgentSource;
}

/**
 * Is this identity actually an email address someone can be written to?
 *
 * The identity key is an opaque string to almost everything — it is whatever
 * sign-in put in `session.user.email`, and since sign-in became a mobile number
 * and a PIN (lib/auth.ts) that is usually an E.164 number. Two places had been
 * written on the assumption that it is always deliverable and broke quietly for
 * phone accounts: Stripe checkout prefilled it as `customer_email`, and the cron
 * addressed reminder and digest mail To: it. Both now ask this first.
 *
 * Deliberately a shape test and nothing more. Its job is to tell an address
 * apart from a phone number, not to validate email.
 */
export function isEmailIdentity(id: string | undefined | null): boolean {
  return !!id && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(id);
}

/**
 * Who is this request acting as? A browser presents a NextAuth session cookie;
 * the gateway presents a scoped bearer token. The session is checked first so a
 * signed-in browser never pays for a token lookup.
 */
export async function identify(headers: Headers, scope: GatewayScope): Promise<Identity> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (email) return { email, source: "browser" };

  const token = bearerFrom(headers);
  if (token) {
    const tokenEmail = await emailForToken(token, scope);
    if (tokenEmail) return { email: tokenEmail, source: "gateway" };
  }

  return { source: "gateway" };
}
