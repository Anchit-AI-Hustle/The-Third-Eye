import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export interface DeviceContactRecord {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  relationship?: string;
  notes?: string;
  source?: "device" | "manual" | "imported" | "vcf";
  updated_at: string;
}

const MEMORY_KEY = "device_contacts";

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: "Not authenticated", contacts: [] }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database not configured", contacts: [] }, { status: 501 });
  }

  const { data, error } = await db
    .from("jarvis_memory")
    .select("value")
    .eq("user_id", email)
    .eq("key", MEMORY_KEY)
    .maybeSingle();

  if (error || !data?.value) {
    return NextResponse.json({ ok: true, contacts: [] });
  }

  try {
    const contacts: DeviceContactRecord[] = JSON.parse(data.value);
    return NextResponse.json({ ok: true, contacts: Array.isArray(contacts) ? contacts : [] });
  } catch {
    return NextResponse.json({ ok: true, contacts: [] });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 501 });
  }

  try {
    const body = await req.json();
    const incoming: DeviceContactRecord[] = Array.isArray(body?.contacts) ? body.contacts : [];
    const removed = new Set<string>(Array.isArray(body?.removed) ? body.removed.map(String) : []);
    // A device's list is merged into the saved one, not written over it: an
    // older device would otherwise erase contacts saved from another. Deletes
    // come as ids, so a removed contact is not merged back in.
    const { data: cur } = await db.from("jarvis_memory").select("value").eq("user_id", email).eq("key", MEMORY_KEY).maybeSingle();
    let saved: DeviceContactRecord[] = [];
    try { saved = cur?.value ? JSON.parse(cur.value) : []; } catch { saved = []; }
    const contacts = mergeContacts(Array.isArray(saved) ? saved : [], incoming, removed);

    const now = new Date().toISOString();
    const { error } = await db.from("jarvis_memory").upsert(
      [
        {
          user_id: email,
          key: MEMORY_KEY,
          value: JSON.stringify(contacts),
          updated_at: now,
        },
      ],
      { onConflict: "user_id,key" }
    );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: contacts.length });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Invalid payload" }, { status: 400 });
  }
}

const phoneKey = (p?: string) => (p ?? "").replace(/\D/g, "").slice(-10);

function mergeContacts(saved: DeviceContactRecord[], incoming: DeviceContactRecord[], removed: Set<string>): DeviceContactRecord[] {
  const out = new Map<string, DeviceContactRecord>();
  for (const c of saved) if (c?.id && !removed.has(c.id)) out.set(c.id, c);
  for (const c of incoming) {
    if (!c?.id || removed.has(c.id)) continue;
    // The same person under another id (same phone, or same name with no phone) is replaced, not duplicated.
    for (const [id, o] of out) {
      const samePhone = phoneKey(c.phone) && phoneKey(c.phone) === phoneKey(o.phone);
      const sameName = !c.phone && !o.phone && c.name?.trim().toLowerCase() === o.name?.trim().toLowerCase();
      if (id !== c.id && (samePhone || sameName)) out.delete(id);
    }
    out.set(c.id, c);
  }
  return [...out.values()];
}
