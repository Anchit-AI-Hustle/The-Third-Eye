import { getAdminSupabase } from "@/lib/serverSupabase";

// Server-side counterpart to lib/agentControl.ts. That module keeps the kill
// switch and audit log in localStorage, which binds only the browser tab that
// owns them — a headless client would bypass both. Enforcing them here means
// every caller is subject to the same brakes and leaves the same record.

export type AgentSource = "browser" | "gateway";

export interface AuditEntry {
  type: string;
  label: string;
  outcome: "applied" | "blocked" | "failed";
}

export async function isAgentKilled(email: string): Promise<boolean> {
  const sb = getAdminSupabase();
  if (!sb) return false;
  const { data } = await sb
    .from("agent_control")
    .select("killed")
    .eq("user_id", email)
    .maybeSingle();
  return data?.killed === true;
}

export async function setAgentKilled(email: string, killed: boolean): Promise<void> {
  const sb = getAdminSupabase();
  if (!sb) return;
  await sb
    .from("agent_control")
    .upsert({ user_id: email, killed, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}

// Never throws: an audit write that fails must not take the user's action down
// with it. A dropped row is visible as a gap; a 500 is not.
export async function logAgentAction(
  email: string,
  entry: AuditEntry,
  source: AgentSource = "browser",
): Promise<void> {
  const sb = getAdminSupabase();
  if (!sb) return;
  try {
    await sb.from("agent_audit").insert({ user_id: email, source, ...entry });
  } catch {
    /* noop */
  }
}

export async function recentAgentLog(email: string, limit = 100) {
  const sb = getAdminSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("agent_audit")
    .select("id, ts, type, label, outcome, source")
    .eq("user_id", email)
    .order("ts", { ascending: false })
    .limit(limit);
  return data ?? [];
}
