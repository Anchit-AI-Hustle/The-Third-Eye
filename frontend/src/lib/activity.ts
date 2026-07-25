import { getAdminSupabase } from "@/lib/serverSupabase";

// Ported from Personal-AI-OS database/db.py log_activity / activities_for_day.
// A human-readable, day-wise trail of what the assistant did on the user's
// behalf (ingestion runs, executed actions, etc.).

export interface ActivityRow {
  id: string;
  user_id: string;
  day: string;
  kind: string;
  title: string;
  detail: string | null;
  status: string;
  context: unknown;
  created_at: string;
}

export async function logActivity(
  userId: string,
  kind: string,
  title: string,
  opts: { detail?: string | null; status?: string; context?: unknown } = {},
): Promise<void> {
  const sb = getAdminSupabase();
  if (!sb) return;
  const now = new Date();
  await sb.from("activity_log").insert({
    user_id: userId,
    day: now.toISOString().slice(0, 10),
    kind,
    title,
    detail: opts.detail ?? null,
    status: opts.status ?? "done",
    context: opts.context ?? null,
    created_at: now.toISOString(),
  });
}

export async function activitiesForDay(userId: string, day?: string): Promise<ActivityRow[]> {
  const sb = getAdminSupabase();
  if (!sb) return [];
  const d = day ?? new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("activity_log")
    .select("*")
    .eq("user_id", userId)
    .eq("day", d)
    .order("created_at", { ascending: false });
  return (data as ActivityRow[] | null) ?? [];
}
