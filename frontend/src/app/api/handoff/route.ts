import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";

// Laptop -> phone handoff. POST queues an outreach action for the phone (only
// when a phone has checked in recently, else the caller opens it locally); GET
// is the phone's check-in and returns what is waiting; PATCH closes one.

const PHONE_FRESH_MS = 14 * 24 * 60 * 60_000;
const PENDING_FOR_MS = 30 * 60_000;
const ACTIONS = ["whatsapp", "sms", "call"];
const SCHEMES = /^(https:\/\/wa\.me\/|whatsapp:|sms:|tel:)/i;

const email = async () => (await getServerSession(authOptions))?.user?.email ?? null;

export async function POST(req: Request) {
  const user = await email();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { action?: string; url?: string; nativeUrl?: string; label?: string; detail?: string } | null;
  if (!b?.action || !ACTIONS.includes(b.action) || !b.url || !SCHEMES.test(b.url) || (b.nativeUrl && !SCHEMES.test(b.nativeUrl))) {
    return Response.json({ error: "Unsupported action" }, { status: 400 });
  }
  const sb = getDb();
  if (!sb) return Response.json({ queued: false });
  const { data: phone } = await sb.from("handoff_phones").select("seen_at").eq("user_id", user).maybeSingle();
  if (!phone || Date.now() - Date.parse(phone.seen_at) > PHONE_FRESH_MS) return Response.json({ queued: false });

  const label = String(b.label ?? "").slice(0, 120);
  const detail = String(b.detail ?? "").slice(0, 300);
  const { data, error } = await sb.from("device_handoffs")
    .insert({ user_id: user, action: b.action, url: b.url, native_url: b.nativeUrl ?? null, label, detail })
    .select("id").single();
  if (error) return Response.json({ queued: false });
  const pushed = await sendPush(user, label || "From your laptop", detail || "Tap to open it on this phone.", "/assistant").catch(() => false);
  return Response.json({ queued: true, id: data.id, pushed });
}

export async function GET() {
  const user = await email();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const sb = getDb();
  if (!sb) return Response.json({ items: [] });
  await sb.from("handoff_phones").upsert({ user_id: user, seen_at: new Date().toISOString() }, { onConflict: "user_id" });
  const { data } = await sb.from("device_handoffs")
    .select("id, action, url, native_url, label, detail, created_at")
    .eq("user_id", user).eq("status", "pending")
    .gte("created_at", new Date(Date.now() - PENDING_FOR_MS).toISOString())
    .order("created_at", { ascending: true }).limit(5);
  return Response.json({ items: data ?? [] });
}

export async function PATCH(req: Request) {
  const user = await email();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const sb = getDb();
  if (!sb) return Response.json({ ok: false });
  const b = (await req.json().catch(() => null)) as { id?: string; status?: string } | null;
  if (!b?.id || (b.status !== "opened" && b.status !== "dismissed")) return Response.json({ error: "id and status required" }, { status: 400 });
  await sb.from("device_handoffs").update({ status: b.status, done_at: new Date().toISOString() }).eq("user_id", user).eq("id", b.id);
  return Response.json({ ok: true });
}
