import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { llmCascade } from "@/lib/llmCascade";
import { z } from "zod";
import { parseLlmJson, validItems } from "@/lib/llmJson";
import { saveExtractedTasks, type ExtractedTask, type TaskWorkspace } from "@/lib/tasks";
import { logActivity } from "@/lib/activity";

// AI Log Sync: turn raw device activity logs (what the operator did on the
// computer/phone the app runs on) into Task Tracker changes — progress updates
// on existing tasks, completions, and new tasks classified into the
// Office vs Personal workspace.

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
You are the user's chief-of-staff AI.
Office work means the user's job: their employer, clients, colleagues and professional projects.

You receive (1) their current open tasks and (2) a raw activity log from their
devices: pages/apps used, on which device, for how long. Update their tracker.
Return STRICT JSON:
{"summary": string, "task_updates": [ ... ], "new_tasks": [ ... ]}

- summary: 2-4 plain sentences of what they actually worked on, split by office
  vs personal. Mention devices only when it adds signal.
- task_updates: ONLY for listed open tasks the logs clearly show progress or
  completion on. Each: {"task_id": verbatim id from the list,
  "update": what the logs evidence, <= 140 chars,
  "status": "in_progress" | "done" | null (null = no status change)}.
- new_tasks: concrete follow-ups the logs clearly evidence (started but
  unfinished work, something opened repeatedly without resolution). Each:
  {"task_heading": specific imperative <= 70 chars,
   "task_description": context <= 180 chars,
   "workspace": "office" for work | "personal" for everything else,
   "urgency": "Low" | "Medium" | "High" | "Critical",
   "deadline": ISO date or null,
   "owner": real person name or null}

HARD RULES:
- Work as defined above → workspace "office". Life admin, health, finances,
  learning, errands → workspace "personal".
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

const nonEmpty = z.string().trim().min(1);
const TaskUpdate = z.object({ task_id: nonEmpty, update: nonEmpty, status: z.string().optional().catch(undefined) });
const NewTask = z.object({
  task_heading: nonEmpty,
  task_description: z.string().nullish().catch(null),
  urgency: z.string().nullish().catch(null),
  deadline: z.string().nullish().catch(null),
  owner: z.string().nullish().catch(null),
  workspace: z.string().nullish().catch(null),
});

export interface LogSyncResult {
  processed: number;
  updated: number;
  inserted: number;
  merged: number;
  summary: string | null;
  skipped?: string;
  partial?: string;
}

export async function summarizeDeviceLogs(email: string): Promise<LogSyncResult> {
  const sb = getDb();
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

  let raw: string;
  try {
    const out = await llmCascade({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
      jsonMode: true,
      // 400 log lines can yield many updates; 1500 tokens cut answers off mid-array.
      maxTokens: 4000,
      temperature: 0.1,
      stage: "log-sync",
      background: true,
    });
    raw = out.text;
  } catch (e) {
    console.error("log sync extraction failed:", e instanceof Error ? e.message : e);
    return { processed: 0, updated: 0, inserted: 0, merged: 0, summary: null, skipped: "extraction failed" };
  }

  // Unreadable output leaves the logs pending for the next run; a repaired or
  // partly invalid one is applied for what it holds, with the reason logged.
  let parsed: Record<string, unknown>;
  const reasons: string[] = [];
  try {
    const p = parseLlmJson(raw);
    parsed = p.value;
    if (p.repaired) reasons.push("output repaired");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn("log sync unreadable:", reason);
    return { processed: 0, updated: 0, inserted: 0, merged: 0, summary: null, skipped: `extraction failed: ${reason}` };
  }
  const updates = validItems(parsed.task_updates, TaskUpdate);
  const created = validItems(parsed.new_tasks, NewTask);
  if (updates.dropped + created.dropped) reasons.push(`${updates.dropped + created.dropped} invalid item(s) dropped`);
  const partial = reasons.join("; ") || undefined;
  if (partial) console.warn("log sync partial:", partial);

  const summary = str(parsed.summary);
  const openById = new Map(openTasks.map((t) => [t.id, t]));
  const now = new Date().toISOString();
  const stamp = now.slice(0, 16).replace("T", " ");

  // ── apply updates to existing tasks ────────────────────────────────────────
  let updated = 0;
  for (const u of updates.items) {
    const task = openById.get(u.task_id);
    if (!task) continue;
    const text = u.update;

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
  const newTasks: ExtractedTask[] = [];
  for (const t of created.items) {
    const ws = str(t.workspace);
    newTasks.push({
      taskHeading: t.task_heading,
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

  return { processed: logs.length, updated, inserted: saved.inserted, merged: saved.merged, summary, partial };
}
