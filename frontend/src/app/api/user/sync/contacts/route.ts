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
