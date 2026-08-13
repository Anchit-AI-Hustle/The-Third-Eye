import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bearerFrom, emailForToken, type GatewayScope } from "@/lib/gatewayAuth";
import type { AgentSource } from "@/lib/agentGuard";

export interface Identity {
  email?: string;
  source: AgentSource;
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
