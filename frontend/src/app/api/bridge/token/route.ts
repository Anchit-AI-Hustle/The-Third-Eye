import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/gatewayAuth";

export const runtime = "nodejs";

// A chat-only token for a bridge (OpenClaw on the user's own WhatsApp) to talk
// to JARVIS as this user. Shown once; the newest one wins, so a replacement
// revokes every earlier one, even when two are minted at once.
const NAME = "OpenClaw";

type Ctx = { email: string; db: NonNullable<ReturnType<typeof getDb>> };

async function ctx(): Promise<{ error: Response } | Ctx> {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = getDb();
  if (!db) return { error: Response.json({ error: "Storage not configured" }, { status: 501 }) };
  return { email, db };
}

const revoke = (c: Ctx, before?: string) => {
  const q = c.db.from("gateway_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", c.email).eq("name", NAME).is("revoked_at", null);
  return before ? q.lt("created_at", before) : q;
};

export async function GET() {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { data } = await c.db.from("gateway_tokens").select("created_at, last_used_at").eq("user_id", c.email).eq("name", NAME).is("revoked_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return Response.json({ active: !!data, createdAt: data?.created_at ?? null, lastUsedAt: data?.last_used_at ?? null });
}

export async function POST() {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { token, hash } = mintToken();
  const { data, error } = await c.db.from("gateway_tokens").insert({ user_id: c.email, name: NAME, token_hash: hash, scopes: ["chat"] }).select("created_at").single();
  if (error || !data) return Response.json({ error: "Couldn't create the token." }, { status: 500 });
  if ((await revoke(c, data.created_at as string)).error) {
    await c.db.from("gateway_tokens").delete().eq("token_hash", hash);
    return Response.json({ error: "Couldn't replace the old token." }, { status: 500 });
  }
  return Response.json({ token });
}

export async function DELETE() {
  const c = await ctx();
  if ("error" in c) return c.error;
  if ((await revoke(c)).error) return Response.json({ error: "Couldn't revoke the token." }, { status: 500 });
  return Response.json({ ok: true });
}
