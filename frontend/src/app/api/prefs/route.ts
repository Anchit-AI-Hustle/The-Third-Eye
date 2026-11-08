import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { MAX_VALUE_CHARS, localKey } from "@/lib/account/syncKeys";

export const runtime = "nodejs";

// The person's settings and on-device app data, kept on their account so every
// device they sign in on has the same (lib/account/syncKeys.ts says which).

const MAX_ITEMS = 200;
const allowed = (key: unknown): key is string => typeof key === "string" && key.length <= 300 && localKey(key, "x") !== null;

export async function GET() {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const sb = getDb();
  if (!sb) return Response.json({ items: [] });
  const { data } = await sb.from("user_prefs").select("key, value, updated_at").eq("user_id", email);
  return Response.json({
    items: ((data ?? []) as { key: string; value: string | null; updated_at: string }[]).map((r) => ({ key: r.key, value: r.value, updatedAt: Date.parse(r.updated_at) })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const sb = getDb();
  if (!sb) return Response.json({ saved: 0 });
  const b = (await req.json().catch(() => null)) as { items?: { key?: unknown; value?: unknown; updatedAt?: unknown }[] } | null;
  const items = (Array.isArray(b?.items) ? b!.items : []).slice(0, MAX_ITEMS).filter((i) => allowed(i.key) && (i.value === null || (typeof i.value === "string" && i.value.length <= MAX_VALUE_CHARS)));
  if (!items.length) return Response.json({ saved: 0 });
  const rows = items.map((i) => ({
    user_id: email, key: i.key as string, value: i.value as string | null,
    updated_at: new Date(typeof i.updatedAt === "number" && i.updatedAt <= Date.now() + 60_000 ? i.updatedAt : Date.now()).toISOString(),
  }));
  const { error } = await sb.from("user_prefs").upsert(rows, { onConflict: "user_id,key" });
  if (error) return Response.json({ error: "Couldn't save your settings." }, { status: 500 });
  return Response.json({ saved: rows.length });
}
