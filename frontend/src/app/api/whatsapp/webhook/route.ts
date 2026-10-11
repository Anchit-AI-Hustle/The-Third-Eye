import { after, type NextRequest } from "next/server";
import { validSignature, whatsappConfigured } from "@/lib/whatsapp";
import { handleInbound } from "@/lib/whatsappAgent";

export const runtime = "nodejs";
export const maxDuration = 60;

// Meta's subscription handshake: echo the challenge when the verify token matches.
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Acknowledge at once (Meta retries slow webhooks) and answer after the response.
export async function POST(req: NextRequest) {
  if (!whatsappConfigured()) return new Response("Not configured", { status: 501 });
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  const payload = JSON.parse(raw);
  const messages = (payload.entry ?? []).flatMap((e: any) => (e.changes ?? []).flatMap((c: any) => c.value?.messages ?? []));
  after(async () => {
    for (const m of messages) await handleInbound(m).catch((e) => console.error("whatsapp inbound failed:", e));
  });
  return new Response("OK", { status: 200 });
}
