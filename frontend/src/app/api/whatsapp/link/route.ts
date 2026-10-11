import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { mintToken } from "@/lib/gatewayAuth";
import { newLinkCode, whatsappConfigured, type WhatsAppLink } from "@/lib/whatsapp";

export const runtime = "nodejs";

const CODE_TTL_MS = 15 * 60 * 1000;

async function ctx() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = getDb();
  if (!db) return { error: Response.json({ error: "Storage not configured" }, { status: 501 }) };
  return { email, db };
}

const jarvisNumber = () => (process.env.WHATSAPP_DISPLAY_NUMBER ?? "").replace(/\D/g, "");
const mask = (phone: string) => `+${phone.slice(0, -4).replace(/\d/g, "•")}${phone.slice(-4)}`;

export async function GET() {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { data } = await c.db.from("whatsapp_links").select("phone, notify, linked_at").eq("user_id", c.email).maybeSingle();
  const link = data as Pick<WhatsAppLink, "phone" | "notify" | "linked_at"> | null;
  return Response.json({
    configured: whatsappConfigured(),
    jarvisNumber: jarvisNumber() || null,
    linked: !!link?.phone,
    phone: link?.phone ? mask(link.phone) : null,
    notify: link?.notify ?? true,
  });
}

// Starts linking: a one-time code the user sends to JARVIS's number from their
// own WhatsApp, which proves the number is theirs without an SMS step.
export async function POST() {
  const c = await ctx();
  if ("error" in c) return c.error;
  if (!whatsappConfigured()) return Response.json({ error: "WhatsApp isn't set up on this deployment yet." }, { status: 501 });

  const { data: existing } = await c.db.from("whatsapp_links").select("gateway_token_enc").eq("user_id", c.email).maybeSingle();
  let tokenEnc = (existing as { gateway_token_enc?: string } | null)?.gateway_token_enc ?? null;
  if (!tokenEnc) {
    const { token, hash } = mintToken();
    tokenEnc = encrypt(token);
    if (!tokenEnc) return Response.json({ error: "Token storage isn't configured." }, { status: 501 });
    await c.db.from("gateway_tokens").insert({ user_id: c.email, name: "WhatsApp", token_hash: hash, scopes: ["chat"] });
  }
  const code = newLinkCode();
  await c.db.from("whatsapp_links").upsert(
    { user_id: c.email, link_code: code, code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(), gateway_token_enc: tokenEnc },
    { onConflict: "user_id" },
  );
  const num = jarvisNumber();
  return Response.json({ code, jarvisNumber: num || null, link: num ? `https://wa.me/${num}?text=${encodeURIComponent(`LINK ${code}`)}` : null });
}

export async function PATCH(req: Request) {
  const c = await ctx();
  if ("error" in c) return c.error;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.notify !== "boolean") return Response.json({ error: "notify required" }, { status: 400 });
  await c.db.from("whatsapp_links").update({ notify: body.notify }).eq("user_id", c.email);
  return Response.json({ ok: true });
}

// Unlink: forget the number and revoke the token the webhook acted with.
export async function DELETE() {
  const c = await ctx();
  if ("error" in c) return c.error;
  await c.db.from("gateway_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", c.email).eq("name", "WhatsApp");
  await c.db.from("whatsapp_links").delete().eq("user_id", c.email);
  return Response.json({ ok: true });
}
