"use client";

/**
 * Thin client for the per-user data API (/api/data/[entity]).
 *
 * The server route authenticates via the NextAuth session and persists with
 * the service-role Supabase client (see the route for why the browser can't
 * hit Supabase directly). Every call reports whether the server actually
 * handled it via `remote`: when false (not signed in, or Supabase not
 * configured → 401/501), the caller falls back to localStorage so the app
 * still works offline / unconfigured.
 */

export interface ListResult<T> {
  remote: boolean;
  rows: T[];
}

async function req(entity: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(`/api/data/${entity}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    return null;
  }
}

// 401 (no session) and 501 (Supabase unconfigured) both mean "use local".
function isLocalOnly(res: Response | null): boolean {
  return !res || res.status === 401 || res.status === 501;
}

export async function dataList<T>(entity: string): Promise<ListResult<T>> {
  const res = await req(entity, { method: "GET" });
  if (isLocalOnly(res)) return { remote: false, rows: [] };
  if (!res!.ok) return { remote: true, rows: [] }; // remote but errored — don't clobber with local
  const json = await res!.json().catch(() => ({ rows: [] }));
  return { remote: true, rows: (json.rows as T[]) ?? [] };
}

/** Insert one or many rows. Returns whether the server handled it. */
export async function dataInsert(entity: string, rows: unknown | unknown[]): Promise<boolean> {
  const res = await req(entity, { method: "POST", body: JSON.stringify(rows) });
  return !isLocalOnly(res);
}

export async function dataUpdate(entity: string, id: string, patch: Record<string, unknown>): Promise<boolean> {
  const res = await req(entity, { method: "PATCH", body: JSON.stringify({ id, patch }) });
  return !isLocalOnly(res);
}

export async function dataDelete(entity: string, id: string): Promise<boolean> {
  const res = await req(`${entity}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  return !isLocalOnly(res);
}
