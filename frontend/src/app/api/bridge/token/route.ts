import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/gatewayAuth";

export const runtime = "nodejs";

// A chat-only token for a bridge (OpenClaw on the user's own WhatsApp) to talk
// to JARVIS as this user. Shown once; minting a new one revokes the old.
const NAME = "OpenClaw";

async function ctx() {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = getDb();
  if (!db) return { error: Response.json({ error: "Storage not configured" }, { status: 501 }) };
  return { email, db };
}

const revoke = (c: { email: string; db: NonNullable<ReturnType<typeof getDb>> }) =>
  c.db.from("gateway_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", c.email).eq("name", NAME).is("revoked_at", null);

export async function GET() {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { data } = await c.db.from("gateway_tokens").select("created_at, last_used_at").eq("user_id", c.email).eq("name", NAME).is("revoked_at", null).maybeSingle();
  return Response.json({ active: !!data, createdAt: data?.created_at ?? null, lastUsedAt: data?.last_used_at ?? null });
}

export async function POST() {
  const c = await ctx();
  if ("error" in c) return c.error;
  await revoke(c);
  const { token, hash } = mintToken();
  const { error } = await c.db.from("gateway_tokens").insert({ user_id: c.email, name: NAME, token_hash: hash, scopes: ["chat"] });
  if (error) return Response.json({ error: "Couldn't create the token." }, { status: 500 });
  return Response.json({ token });
}

export async function DELETE() {
  const c = await ctx();
  if ("error" in c) return c.error;
  await revoke(c);
  return Response.json({ ok: true });
}
