import { createHash, randomBytes } from "crypto";
import { getAdminSupabase } from "@/lib/serverSupabase";

// Bearer credentials for clients that have no browser session — the always-on
// gateway process, and anything else that needs to act as one user without a
// cookie. Scoped so a token minted for speech cannot also write to the data API.

export const GATEWAY_SCOPES = ["chat", "transcribe", "data"] as const;
export type GatewayScope = (typeof GATEWAY_SCOPES)[number];

const PREFIX = "te_gw_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// The plaintext is returned to the caller once, at mint, and never stored.
export function mintToken(): { token: string; hash: string } {
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export function bearerFrom(headers: Headers): string | null {
  const raw = headers.get("authorization");
  if (!raw?.startsWith("Bearer ")) return null;
  const token = raw.slice(7).trim();
  return token.startsWith(PREFIX) ? token : null;
}

/**
 * Resolves a gateway token to the user it acts for, or null if it is unknown,
 * revoked, or not scoped for what is being attempted. Lookup is by hash, so the
 * token itself is never compared against a stored value.
 */
export async function emailForToken(token: string, scope: GatewayScope): Promise<string | null> {
  const sb = getAdminSupabase();
  if (!sb) return null;

  const hash = hashToken(token);
  const { data } = await sb
    .from("gateway_tokens")
    .select("user_id, scopes, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;
  if (!(data.scopes ?? []).includes(scope)) return null;

  // Best-effort: a failed touch must not cost the caller their request.
  void sb
    .from("gateway_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .then(() => undefined, () => undefined);

  return data.user_id;
}
