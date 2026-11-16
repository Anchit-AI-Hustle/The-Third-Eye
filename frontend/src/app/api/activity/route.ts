import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAgentKilled, recentAgentLog, setAgentKilled } from "@/lib/agentGuard";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export interface UnifiedActivityEntry {
  id: string;
  ts: string;
  type: string;
  label: string;
  outcome: "applied" | "blocked" | "failed";
  source?: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const sb = getDb();
  const [killed, auditRows, activityRows] = await Promise.all([
    isAgentKilled(email).catch(() => false),
    recentAgentLog(email, 100).catch(() => []),
    sb
      ? sb
          .from("activity_log")
          .select("id, kind, title, detail, status, created_at")
          .eq("user_id", email)
          .order("created_at", { ascending: false })
          .limit(50)
          .then((r) => r.data ?? [], () => [])
      : Promise.resolve([]),
  ]);

  const entries: UnifiedActivityEntry[] = [
    ...(auditRows as Array<{ id?: string; ts?: string; type?: string; label?: string; outcome?: string; source?: string }>).map((r) => ({
      id: String(r.id ?? crypto.randomUUID()),
      ts: String(r.ts ?? new Date().toISOString()),
      type: String(r.type ?? "agent"),
      label: String(r.label ?? "Agent action"),
      outcome: (r.outcome === "blocked" || r.outcome === "failed" ? r.outcome : "applied") as UnifiedActivityEntry["outcome"],
      source: r.source ? String(r.source) : "server",
    })),
    ...(activityRows as Array<{ id?: string; kind?: string; title?: string; detail?: string | null; status?: string; created_at?: string }>).map((r) => ({
      id: `act_${String(r.id ?? crypto.randomUUID())}`,
      ts: String(r.created_at ?? new Date().toISOString()),
      type: String(r.kind ?? "activity"),
      label: r.detail ? `${r.title ?? "Activity"} — ${String(r.detail).slice(0, 120)}` : String(r.title ?? "Activity"),
      outcome: (r.status === "failed" ? "failed" : r.status === "blocked" ? "blocked" : "applied") as UnifiedActivityEntry["outcome"],
      source: "background",
    })),
  ].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

  return Response.json(
    { killed, entries: entries.slice(0, 150) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { killed?: unknown };
  if (typeof body.killed !== "boolean") {
    return Response.json({ error: "killed boolean required" }, { status: 400 });
  }
  await setAgentKilled(email, body.killed);
  return Response.json({ ok: true, killed: body.killed }, { headers: { "Cache-Control": "no-store" } });
}
