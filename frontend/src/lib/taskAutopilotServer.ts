import type { Db } from "@/lib/db";
import { applySideEffects } from "@/lib/whatsapp";
import { judgeRun, STALE_MS, type AutopilotRun, type AutopilotStatus, type AutopilotTask } from "@/lib/taskAutopilot";

// Claiming a task and recording a run's outcome, shared by the browser path
// (/api/tasks/autopilot) and the scheduled server run (/api/cron/autopilot).

const SOURCE = "Autopilot";
type Effect = { type: string; data?: Record<string, unknown> };
export type TaskRow = Record<string, any>;

export const TASK_COLUMNS = "id, title, description, due_date, priority, status, all_updates, autopilot_status, autopilot_at, source_type";

/** Takes a task for one run. Conditional on the status read, so two runners never both win. */
export async function claimTask(sb: Db, email: string, task: TaskRow): Promise<AutopilotTask | null> {
  const running = task.autopilot_status === "running" && Date.now() - new Date(task.autopilot_at ?? 0).getTime() < STALE_MS;
  if (running || task.status === "done" || task.status === "cancelled") return null;
  const q = sb.from("tasks").update({ autopilot_status: "running", autopilot_at: new Date().toISOString() }).eq("user_id", email).eq("id", task.id);
  const { data } = await (task.autopilot_status == null ? q.is("autopilot_status", null) : q.eq("autopilot_status", task.autopilot_status)).select("id");
  if (!Array.isArray(data) || !data.length) return null;
  return { id: task.id, title: task.title, description: task.description, due_date: task.due_date, priority: task.priority, retry: task.autopilot_status === "running" };
}

export async function recordRun(sb: Db, email: string, task: TaskRow, run: AutopilotRun, effects: Effect[], agentName?: string): Promise<{ status: AutopilotStatus; report: string }> {
  const now = new Date().toISOString();
  const { status, report } = judgeRun({
    text: String(run.text ?? ""),
    checklist: Array.isArray(run.checklist) ? run.checklist : [],
    confirms: Array.isArray(run.confirms) ? run.confirms : [],
    stopReason: run.stopReason,
    error: run.error,
  });
  // Follow-ups it creates are tagged so the autopilot does not work them in turn.
  await applySideEffects(email, effects.filter((e) => !(e.type === "task_update" && e.data?.id === task.id) && !(e.type === "task_delete" && e.data?.id === task.id)), SOURCE);
  for (const f of effects.filter((e) => e.type === "file" && typeof e.data?.content === "string")) {
    await sb.from("knowledge_docs").insert({
      id: crypto.randomUUID(), user_id: email, title: String(f.data!.filename ?? task.title), content: String(f.data!.content),
      file_type: String(f.data!.mime ?? "text/plain"), file_size_bytes: String(f.data!.content).length, chunk_count: 1,
      processing_status: "ready", created_at: now,
    });
  }
  const agent = agentName?.trim() ? agentName.trim().slice(0, 40) : "JARVIS";
  const label = status === "done" ? `Done by ${agent}` : status === "needs_you" ? `${agent} worked on it; needs you` : `${agent} couldn't work on it`;
  const line = `[${now.slice(0, 16).replace("T", " ")} · ${SOURCE}] ${label}: ${report.split("\n")[0].slice(0, 200)}`;
  const patch: Record<string, unknown> = {
    autopilot_status: status, autopilot_report: report, autopilot_at: now, updated_at: now,
    all_updates: task.all_updates ? `${task.all_updates}\n${line}` : line,
  };
  if (status === "done") { patch.status = "done"; patch.completed_at = now.slice(0, 10); }
  else if (status === "needs_you" && task.status === "todo") patch.status = "in_progress";
  await sb.from("tasks").update(patch).eq("user_id", email).eq("id", task.id);
  return { status, report };
}

export const MAX_ATTEMPTS = 3;
export const RETRY_AFTER_MS = 6 * 60 * 60_000;

/** How many runs of this task failed outright (provider down, network), from its update log. */
export function failedAttempts(task: TaskRow): number {
  return (String(task.all_updates ?? "").match(/couldn't work on it/g) ?? []).length;
}

/**
 * Open tasks a run should take: never worked, interrupted mid-run, or failed
 * outright and due a retry (at most MAX_ATTEMPTS, RETRY_AFTER_MS apart).
 * "needs you" tasks are left for the user, and follow-ups the autopilot made are skipped.
 */
export function dueForRun(task: TaskRow, now = Date.now()): boolean {
  if (task.status !== "todo" || task.source_type === SOURCE) return false;
  const at = new Date(task.autopilot_at ?? 0).getTime();
  if (task.autopilot_status == null) return true;
  if (task.autopilot_status === "running") return now - at > STALE_MS;
  if (task.autopilot_status === "failed") return failedAttempts(task) < MAX_ATTEMPTS && now - at > RETRY_AFTER_MS;
  return false;
}
