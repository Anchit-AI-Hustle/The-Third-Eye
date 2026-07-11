import { getAdminSupabase } from "@/lib/serverSupabase";
import { encrypt, decrypt } from "@/lib/crypto";

// Per-user connector credentials + incremental-sync cursors, stored in your own
// Supabase. Credentials are AES-256-GCM encrypted at rest via lib/crypto.

export type Provider = "shopify" | "klaviyo" | "webengage";

export async function saveCredentials(
  userId: string,
  provider: Provider,
  credentials: Record<string, unknown>,
  meta?: Record<string, unknown>,
): Promise<boolean> {
  const sb = getAdminSupabase();
  if (!sb) return false;
  const enc = encrypt(JSON.stringify(credentials));
  if (!enc) return false;
  const { error } = await sb.from("integration_credentials").upsert(
    { user_id: userId, provider, credentials_enc: enc, meta: meta ?? null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,provider" },
  );
  return !error;
}

export async function getCredentials<T = Record<string, unknown>>(
  userId: string,
  provider: Provider,
): Promise<{ credentials: T; meta: Record<string, unknown> | null } | null> {
  const sb = getAdminSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("integration_credentials")
    .select("credentials_enc, meta")
    .eq("user_id", userId).eq("provider", provider).maybeSingle();
  const row = data as { credentials_enc?: string; meta?: Record<string, unknown> | null } | null;
  if (!row?.credentials_enc) return null;
  const json = decrypt(row.credentials_enc);
  if (!json) return null;
  try {
    return { credentials: JSON.parse(json) as T, meta: row.meta ?? null };
  } catch {
    return null;
  }
}

export async function usersWithProvider(provider: Provider): Promise<string[]> {
  const sb = getAdminSupabase();
  if (!sb) return [];
  const { data } = await sb.from("integration_credentials").select("user_id").eq("provider", provider);
  return ((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id);
}

export async function getCursor(userId: string, provider: Provider, resource: string): Promise<string | null> {
  const sb = getAdminSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("sync_state").select("cursor")
    .eq("user_id", userId).eq("provider", provider).eq("resource", resource).maybeSingle();
  return (data as { cursor?: string } | null)?.cursor ?? null;
}

export async function setCursor(userId: string, provider: Provider, resource: string, cursor: string): Promise<void> {
  const sb = getAdminSupabase();
  if (!sb) return;
  await sb.from("sync_state").upsert(
    { user_id: userId, provider, resource, cursor, last_run: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "user_id,provider,resource" },
  );
}
