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

export const ESSENTIAL_CONTACT_RECORDS: DeviceContactRecord[] = [
  { id: "c_mom", name: "Mom", phone: "+91 98765 43210", relationship: "Family", notes: "Primary emergency contact", source: "manual", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "c_dad", name: "Dad", phone: "+91 98765 43211", relationship: "Family", notes: "Family contact", source: "manual", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "c_rohit", name: "Rohit Sharma", phone: "+91 98739 45238", relationship: "Work / Friend", notes: "WhatsApp contact", source: "manual", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "c_aviral", name: "Aviral Vahdam", phone: "+91 98111 22334", relationship: "Colleague", notes: "Work & messaging", source: "manual", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "c_emergency", name: "Emergency Dispatch", phone: "112", relationship: "Emergency", notes: "National emergency line", source: "manual", updated_at: "2026-01-01T00:00:00.000Z" },
];

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: "Not authenticated", contacts: [] }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database not configured", contacts: ESSENTIAL_CONTACT_RECORDS }, { status: 501 });
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
    const contacts: DeviceContactRecord[] = Array.isArray(body?.contacts) ? body.contacts : [];

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
