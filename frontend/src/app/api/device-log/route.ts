import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

// Device activity intake: every device the signed-in app runs on (computer or
// phone) pushes batches of usage events here. Raw material for AI Log Sync.
// Also the target of navigator.sendBeacon on pagehide, hence the tolerant body
// parsing (beacons post text/plain).

const MAX_EVENTS_PER_POST = 200;

interface RawEvent {
  device?: unknown;
  platform?: unknown;
  kind?: unknown;
  title?: unknown;
  url?: unknown;
  detail?: unknown;
  duration_s?: unknown;
  started_at?: unknown;
  ended_at?: unknown;
}

function s(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function ts(v: unknown): string | null {
  const t = s(v, 40);
  if (!t || Number.isNaN(Date.parse(t))) return null;
  return new Date(t).toISOString();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const sb = getAdminSupabase();
  if (!sb) return Response.json({ stored: 0, skipped: "not configured" });

  let body: unknown;
  try { body = JSON.parse(await req.text()); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const events = (Array.isArray(body) ? body : [body]).slice(0, MAX_EVENTS_PER_POST) as RawEvent[];

  const rows = events.flatMap((e) => {
    const title = s(e.title);
    const started = ts(e.started_at);
    if (!title || !started) return [];
    return [{
      user_id: email,
      device: s(e.device, 60) ?? "Unknown device",
      platform: s(e.platform, 120),
      kind: s(e.kind, 40) ?? "app_usage",
      title,
      url: s(e.url),
      detail: s(e.detail, 500),
      duration_s: typeof e.duration_s === "number" && e.duration_s >= 0 ? Math.round(e.duration_s) : null,
      started_at: started,
      ended_at: ts(e.ended_at),
    }];
  });
  if (!rows.length) return Response.json({ stored: 0 });

  const { error } = await sb.from("device_logs").insert(rows);
  if (error) {
    console.error("device-log insert:", error.message);
    return Response.json({ error: "Insert failed" }, { status: 500 });
  }
  return Response.json({ stored: rows.length });
}
