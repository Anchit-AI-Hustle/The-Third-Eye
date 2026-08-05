import { randomUUID } from "crypto";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { llmCascade } from "@/lib/llmCascade";
import { parseJsonBlock } from "@/lib/extract";
import { saveExtractedTasks, type ExtractedTask, type TaskWorkspace } from "@/lib/tasks";
import { logActivity } from "@/lib/activity";

// AI Log Sync: turn raw device activity logs (what the operator did on the
// computer/phone the app runs on) into Task Tracker changes — progress updates
// on existing tasks, completions, and new tasks classified into the
// Office (Vahdam) vs Personal workspace.

const MAX_LOGS_PER_RUN = 400;
const MIN_LOGS_TO_SUMMARIZE = 3;

interface DeviceLogRow {
  id: string;
  device: string;
  title: string;
  url: string | null;
  detail: string | null;
  duration_s: number | null;
  started_at: string;
}

interface OpenTaskRow {
  id: string;
  title: string;
  status: string;
  workspace: string | null;
  spoc: string | null;
}

const SYSTEM_PROMPT = `
You are the chief-of-staff AI for Anchit Tandon, who leads D2C growth at Vahdam
India (a premium tea D2C brand). Direct team: Aman, Manisha, Arihant.

You receive (1) his current open tasks and (2) a raw activity log from his
devices — pages/apps used, on which device, for how long. Update his tracker.
Return STRICT JSON:
{"summary": string, "task_updates": [ ... ], "new_tasks": [ ... ]}

- summary: 2-4 plain sentences of what he actually worked on, split by office
  (Vahdam) vs personal. Mention devices only when it adds signal.
- task_updates: ONLY for listed open tasks the logs clearly show progress or
  completion on. Each: {"task_id": verbatim id from the list,
  "update": what the logs evidence, <= 140 chars,
  "status": "in_progress" | "done" | null (null = no status change)}.
- new_tasks: concrete follow-ups the logs clearly evidence (started but
  unfinished work, something opened repeatedly without resolution). Each:
  {"task_heading": specific imperative <= 70 chars,
   "task_description": context <= 180 chars,
   "workspace": "office" for Vahdam work | "personal" for everything else,
   "urgency": "Low" | "Medium" | "High" | "Critical",
   "deadline": ISO date or null,
   "owner": real person name or null}

HARD RULES:
- Vahdam work (growth, marketing, marketplace, CRO, retention, team) →
  workspace "office". Life admin, health, finances, learning, errands →
  workspace "personal".
- No speculation: when the logs don't clearly evidence progress or a
  follow-up, return empty arrays. Never invent task ids or people.
`.trim();

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

function fmtLogLine(l: DeviceLogRow): string {
  const when = l.started_at.slice(0, 16).replace("T", " ");
  const dur = l.duration_s ? ` · ${Math.round(l.duration_s / 60) || "<1"}min` : "";
  const extra = [l.url, l.detail].filter(Boolean).join(" · ");
  return `[${when} · ${l.device}${dur}] ${l.title}${extra ? ` (${extra})` : ""}`;
}

export interface LogSyncResult {
  processed: number;
  updated: number;
  inserted: number;
  merged: number;
  summary: string | null;
  skipped?: string;
}

export async function summarizeDeviceLogs(email: string): Promise<LogSyncResult> {
  const sb = getAdminSupabase();
  if (!sb) return { processed: 0, updated: 0, inserted: 0, merged: 0, summary: null, skipped: "not configured" };

  const { data: logData } = await sb
    .from("device_logs")
    .select("id, device, title, url, detail, duration_s, started_at")
    .eq("user_id", email).eq("processed", false)
    .order("started_at", { ascending: true })
    .limit(MAX_LOGS_PER_RUN);
  const logs = (logData as DeviceLogRow[] | null) ?? [];
  if (logs.length < MIN_LOGS_TO_SUMMARIZE) {
    return { processed: 0, updated: 0, inserted: 0, merged: 0, summary: null, skipped: "not enough logs" };
  }

  const { data: taskData } = await sb
    .from("tasks")
    .select("id, title, status, workspace, spoc")
    .eq("user_id", email).in("status", ["todo", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(100);
  const openTasks = (taskData as OpenTaskRow[] | null) ?? [];

  const taskLines = openTasks.map(
    (t) => `- id=${t.id} [${t.workspace === "personal" ? "personal" : "office"} · ${t.status}] ${t.title}${t.spoc ? ` (owner: ${t.spoc})` : ""}`,
  );
  const user = [
    "OPEN TASKS:",
    taskLines.length ? taskLines.join("\n") : "(none)",
    "",
    "DEVICE ACTIVITY LOG:",
    logs.map(fmtLogLine).join("\n"),
  ].join("\n");

  let parsed: Record<string, unknown>;
  try {
    const out = await llmCascade({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
      jsonMode: true,
      maxTokens: 1500,
      temperature: 0.1,
      stage: "log-sync",
    });
    parsed = parseJsonBlock(out.text);
  } catch (e) {
    console.error("log sync extraction failed:", e);
    return { processed: 0, updated: 0, inserted: 0, merged: 0, summary: null, skipped: "extraction failed" };
  }

  const summary = str(parsed.summary);
  const openById = new Map(openTasks.map((t) => [t.id, t]));
  const now = new Date().toISOString();
  const stamp = now.slice(0, 16).replace("T", " ");

  // ── apply updates to existing tasks ────────────────────────────────────────
  let updated = 0;
  const rawUpdates = Array.isArray(parsed.task_updates) ? (parsed.task_updates as Record<string, unknown>[]) : [];
  for (const u of rawUpdates) {
    const id = str(u.task_id);
    const text = str(u.update);
    const task = id ? openById.get(id) : undefined;
    if (!task || !text) continue;

    const { data: row } = await sb
      .from("tasks").select("all_updates").eq("id", task.id).eq("user_id", email).maybeSingle();
    const existing = ((row as { all_updates?: string } | null)?.all_updates || "").trim();
    const line = `[${stamp} · AI Log Sync] ${text}`;
    const patch: Record<string, unknown> = {
      all_updates: existing ? `${existing}\n${line}` : line,
      updated_at: now,
    };
    const status = str(u.status);
    if (status === "done") {
      patch.status = "done";
      patch.completed_at = now.slice(0, 10);
    } else if (status === "in_progress" && task.status === "todo") {
      patch.status = "in_progress";
    }
    await sb.from("tasks").update(patch).eq("id", task.id).eq("user_id", email);
    updated++;
  }

  // ── create new tasks, classified per workspace ─────────────────────────────
  const rawNew = Array.isArray(parsed.new_tasks) ? (parsed.new_tasks as Record<string, unknown>[]) : [];
  const newTasks: ExtractedTask[] = [];
  for (const t of rawNew) {
    const heading = str(t.task_heading);
    if (!heading) continue;
    const ws = str(t.workspace);
    newTasks.push({
      taskHeading: heading,
      taskDescription: str(t.task_description),
      urgency: str(t.urgency),
      deadline: str(t.deadline),
      owner: str(t.owner),
      workspace: (ws === "personal" ? "personal" : "office") as TaskWorkspace,
    });
  }
  const devices = Array.from(new Set(logs.map((l) => l.device))).join(", ");
  const saved = newTasks.length
    ? await saveExtractedTasks(
        {
          userId: email,
          sourceType: "DeviceLog",
          sourceRefId: `logsync:${randomUUID()}`,
          sourceDetail: `Device activity · ${devices}`,
          dateGiven: now,
        },
        newTasks,
      )
    : { inserted: 0, merged: 0, skipped: 0 };

  // ── mark the batch consumed + leave a day-trail entry ──────────────────────
  await sb.from("device_logs").update({ processed: true }).in("id", logs.map((l) => l.id));
  await logActivity(email, "log_sync", `AI Log Sync: ${logs.length} activity event(s)`, {
    detail: summary,
    context: { processed: logs.length, updated, inserted: saved.inserted, merged: saved.merged, devices },
  });

  return { processed: logs.length, updated, inserted: saved.inserted, merged: saved.merged, summary };
}
