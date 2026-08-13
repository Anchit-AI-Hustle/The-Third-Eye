import { getAdminSupabase } from "@/lib/serverSupabase";

// Server-side durable memory. The client also mirrors this into localStorage so
// a signed-out or offline session still has context, but that copy is per-device
// and dies with the cache — this is the one that survives and follows the user
// between devices. No-ops cleanly when Supabase isn't configured.

export async function loadMemory(email: string): Promise<Record<string, string>> {
  const sb = getAdminSupabase();
  if (!sb) return {};
  const { data } = await sb.from("jarvis_memory").select("key, value").eq("user_id", email).limit(500);
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

// A turn usually touches nothing, so diffing before the round trip is what keeps
// the common case free. Deletions are not represented: the store is additive,
// and a key the model stopped echoing is not an instruction to forget it.
export function changedEntries(
  before: Record<string, string>,
  after: Record<string, string>,
): [string, string][] {
  return Object.entries(after).filter(([k, v]) => typeof v === "string" && before[k] !== v);
}

// Writes only what changed. Callers hand us the store as it looked coming in and
// as it looks now, so an unchanged turn costs no round trip.
export async function saveMemory(
  email: string,
  before: Record<string, string>,
  after: Record<string, string>,
): Promise<number> {
  const sb = getAdminSupabase();
  if (!sb) return 0;

  const changed = changedEntries(before, after);
  if (!changed.length) return 0;

  const now = new Date().toISOString();
  const { error } = await sb.from("jarvis_memory").upsert(
    changed.map(([key, value]) => ({ user_id: email, key, value, updated_at: now })),
    { onConflict: "user_id,key" },
  );
  return error ? 0 : changed.length;
}
