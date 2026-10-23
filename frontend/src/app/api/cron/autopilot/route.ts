import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/gatewayAuth";
import { llmStatus } from "@/lib/llmCascade";
import { NO_PROVIDER, runThroughChat, workOrder } from "@/lib/taskAutopilot";
import { claimTask, dueForRun, OPEN_STATUSES, recordRun, TASK_COLUMNS, type TaskRow } from "@/lib/taskAutopilotServer";

export const runtime = "nodejs";
export const maxDuration = 60;

// Works the task tracker with no tab open: every five minutes (GitHub Actions,
// scheduled-jobs.yml) it takes the most urgent open tasks across all users and
// runs each through /api/chat as its owner, with a single-use chat token.
// A run cut off by the time limit is picked up again once it goes stale.
// While no AI provider is free it works nothing and says so ("waiting"), so
// the scheduled loop stops instead of spending tasks on an outage.

const PER_RUN = 3;
const RUN_MS = 50_000;
const MIN_RUN_MS = 15_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret ? req.headers.get("authorization") !== `Bearer ${secret}` : process.env.NODE_ENV === "production") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getDb();
  const origin = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  if (!sb || !origin) return Response.json({ error: "Autopilot needs the database and NEXTAUTH_URL." }, { status: 501 });

  const waiting = `${NO_PROVIDER} right now; tasks wait for the next run.`;
  if ((await llmStatus()).status === "down") return Response.json({ worked: [], waiting });

  const { data } = await sb.from("tasks").select(`user_id, ${TASK_COLUMNS}`).in("status", OPEN_STATUSES).limit(2000);
  const picked = workOrder(((data ?? []) as TaskRow[]).filter((t) => dueForRun(t))).slice(0, PER_RUN);

  // One task at a time: parallel runs trip free tiers' per-minute limits all at
  // once. Each run gets what is left of the time budget, and the batch stops at
  // the first task that has to wait for a provider.
  const deadline = Date.now() + RUN_MS;
  const results: { id: string; status: string }[] = [];
  for (const task of picked) {
    if (deadline - Date.now() < MIN_RUN_MS) break;
    const email = String(task.user_id);
    const claimed = await claimTask(sb, email, task);
    if (!claimed) { results.push({ id: task.id, status: "skipped" }); continue; }
    const { token, hash } = mintToken();
    await sb.from("gateway_tokens").insert({ user_id: email, name: "autopilot (single run)", token_hash: hash, scopes: ["chat"] });
    try {
      const { run, effects } = await runThroughChat(claimed, undefined, {
        url: `${origin}/api/chat`,
        headers: { Authorization: `Bearer ${token}` },
        timezone: process.env.WHATSAPP_TIMEZONE || "Asia/Kolkata",
        signal: AbortSignal.timeout(deadline - Date.now()),
      });
      const { status, report } = await recordRun(sb, email, task, run, effects);
      results.push({ id: task.id, status: report.startsWith(NO_PROVIDER) ? "waiting" : status });
    } finally {
      await sb.from("gateway_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash);
    }
    if (results.at(-1)!.status === "waiting") break;
  }
  return Response.json({ worked: results, ...(results.some((r) => r.status === "waiting") ? { waiting } : {}) });
}
