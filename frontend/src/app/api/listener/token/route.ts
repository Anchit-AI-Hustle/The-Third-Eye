import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/gatewayAuth";

export const runtime = "nodejs";

// A token for the computer listener (public/wake): it may only transcribe and
// file Life Log chunks as this user. One per computer; shown once at mint.
const NAME = "Computer listener";

async function ctx() {
  const email = (await getServerSession(authOptions))?.user?.email;
  const db = getDb();
  if (!email) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!db) return { error: Response.json({ error: "Storage not configured" }, { status: 501 }) };
  return { email, db };
}

export async function POST() {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { token, hash } = mintToken();
  const { error } = await c.db.from("gateway_tokens").insert({ user_id: c.email, name: NAME, token_hash: hash, scopes: ["transcribe", "lifelog"] });
  if (error) return Response.json({ error: "Couldn't create the token." }, { status: 500 });
  return Response.json({ token });
}

/** Stops every computer listener of this account. */
export async function DELETE() {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { error } = await c.db.from("gateway_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", c.email).eq("name", NAME).is("revoked_at", null);
  if (error) return Response.json({ error: "Couldn't revoke." }, { status: 500 });
  return Response.json({ ok: true });
}
