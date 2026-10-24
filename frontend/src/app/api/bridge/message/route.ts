import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bearerFrom, emailForToken } from "@/lib/gatewayAuth";
import { answer } from "@/lib/whatsappAgent";
import type { WhatsAppLink } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 300;

// One message in, JARVIS's reply out, for a bridge that owns the chat channel
// itself (OpenClaw on the user's WhatsApp). Same brain, history and
// confirm-before-act as the WhatsApp webhook.
export async function POST(req: NextRequest) {
  const token = bearerFrom(req.headers);
  const userId = token ? await emailForToken(token, "chat") : null;
  if (!token || !userId) return Response.json({ error: "Invalid token" }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: "Storage not configured" }, { status: 501 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!text) return Response.json({ error: "text required" }, { status: 400 });

  await db.from("whatsapp_links").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data } = await db.from("whatsapp_links").select("*").eq("user_id", userId).single();
  return Response.json({ reply: await answer(data as WhatsAppLink, token, text) });
}
