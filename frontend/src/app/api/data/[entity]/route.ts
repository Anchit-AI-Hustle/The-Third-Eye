import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

/**
 * Per-user data API for the client hooks (tasks, notes, goals, knowledge, team).
 *
 * The browser cannot talk to Supabase directly: it only has the anon key, and
 * there is no NextAuth→Supabase auth bridge, so Row Level Security silently
 * blocks every read/write. Instead the client calls here; we authenticate with
 * the NextAuth session and use the service-role client scoped to the session
 * email. The service role bypasses RLS, and we always constrain queries to
 * `user_id = <session email>`, so a user can only ever touch their own rows.
 *
 * Status codes the client relies on:
 *   401 → not signed in            (client uses local storage)
 *   501 → Supabase not configured  (client uses local storage)
 *   200 → handled server-side
 */

interface EntityCfg {
  table: string;
  order?: Array<{ col: string; asc?: boolean }>;
}

const ENTITIES: Record<string, EntityCfg> = {
  tasks: { table: "tasks", order: [{ col: "created_at", asc: false }] },
  team_members: { table: "team_members" },
  notes: { table: "notes", order: [{ col: "pinned", asc: false }, { col: "updated_at", asc: false }] },
  goals: { table: "goals", order: [{ col: "created_at", asc: false }] },
  knowledge_docs: { table: "knowledge_docs", order: [{ col: "created_at", asc: false }] },
  expenses: { table: "expenses", order: [{ col: "spent_on", asc: false }, { col: "created_at", asc: false }] },
};

type Ctx =
  | { ok: true; email: string; cfg: EntityCfg; sb: NonNullable<ReturnType<typeof getAdminSupabase>> }
  | { ok: false; status: number; error: string };

async function resolve(entity: string): Promise<Ctx> {
  const cfg = ENTITIES[entity];
  if (!cfg) return { ok: false, status: 400, error: "Unknown entity" };
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return { ok: false, status: 401, error: "Not authenticated" };
  const sb = getAdminSupabase();
  if (!sb) return { ok: false, status: 501, error: "Storage not configured" };
  return { ok: true, email, cfg, sb };
}

function fail(c: Extract<Ctx, { ok: false }>) {
  return Response.json({ error: c.error }, { status: c.status });
}

// Client rows must never set their own user_id — it's always the session email.
function scrub(row: Record<string, unknown>, email: string) {
  const { user_id: _drop, ...rest } = row;
  return { ...rest, user_id: email };
}

export async function GET(_req: NextRequest, { params }: { params: { entity: string } }) {
  const c = await resolve(params.entity);
  if (!c.ok) return fail(c);
  let q = c.sb.from(c.cfg.table).select("*").eq("user_id", c.email);
  for (const o of c.cfg.order ?? []) q = q.order(o.col, { ascending: o.asc ?? true });
  const { data, error } = await q;
  if (error) {
    console.error(`data GET ${c.cfg.table}:`, error.message);
    return Response.json({ error: "Read failed" }, { status: 500 });
  }
  return Response.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { entity: string } }) {
  const c = await resolve(params.entity);
  if (!c.ok) return fail(c);
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return Response.json({ rows: [] });
  const scrubbed = rows.map((r) => scrub(r as Record<string, unknown>, c.email));
  const { data, error } = await c.sb.from(c.cfg.table).insert(scrubbed).select("*");
  if (error) {
    console.error(`data POST ${c.cfg.table}:`, error.message);
    return Response.json({ error: "Insert failed" }, { status: 500 });
  }
  return Response.json({ rows: data ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: { entity: string } }) {
  const c = await resolve(params.entity);
  if (!c.ok) return fail(c);
  let body: { id?: string; patch?: Record<string, unknown> };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id || !body.patch) return Response.json({ error: "id and patch required" }, { status: 400 });
  const { user_id: _drop, id: _dropId, ...patch } = body.patch;
  const { error } = await c.sb.from(c.cfg.table).update(patch).eq("id", body.id).eq("user_id", c.email);
  if (error) {
    console.error(`data PATCH ${c.cfg.table}:`, error.message);
    return Response.json({ error: "Update failed" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { entity: string } }) {
  const c = await resolve(params.entity);
  if (!c.ok) return fail(c);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const { error } = await c.sb.from(c.cfg.table).delete().eq("id", id).eq("user_id", c.email);
  if (error) {
    console.error(`data DELETE ${c.cfg.table}:`, error.message);
    return Response.json({ error: "Delete failed" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
