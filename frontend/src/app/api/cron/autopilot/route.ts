import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/gatewayAuth";
import { runThroughChat, workOrder } from "@/lib/taskAutopilot";
import { claimTask, dueForRun, recordRun, TASK_COLUMNS, type TaskRow } from "@/lib/taskAutopilotServer";

export const runtime = "nodejs";
export const maxDuration = 60;

// Works the task tracker with no tab open: every five minutes (GitHub Actions,
// scheduled-jobs.yml) it takes the most urgent open tasks across all users and
// runs each through /api/chat as its owner, with a single-use chat token.
// A run cut off by the time limit is picked up again once it goes stale.

const PER_RUN = 3;
const RUN_MS = 50_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret ? req.headers.get("authorization") !== `Bearer ${secret}` : process.env.NODE_ENV === "production") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getDb();
  const origin = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  if (!sb || !origin) return Response.json({ error: "Autopilot needs the database and NEXTAUTH_URL." }, { status: 501 });

  const { data } = await sb.from("tasks").select(`user_id, ${TASK_COLUMNS}`).eq("status", "todo").limit(2000);
  const picked = workOrder(((data ?? []) as TaskRow[]).filter((t) => dueForRun(t))).slice(0, PER_RUN);

  const results = await Promise.all(picked.map(async (task) => {
    const email = String(task.user_id);
    const claimed = await claimTask(sb, email, task);
    if (!claimed) return { id: task.id, status: "skipped" };
    const { token, hash } = mintToken();
    await sb.from("gateway_tokens").insert({ user_id: email, name: "autopilot (single run)", token_hash: hash, scopes: ["chat"] });
    try {
      const { run, effects } = await runThroughChat(claimed, undefined, {
        url: `${origin}/api/chat`,
        headers: { Authorization: `Bearer ${token}` },
        timezone: process.env.WHATSAPP_TIMEZONE || "Asia/Kolkata",
        signal: AbortSignal.timeout(RUN_MS),
      });
      const { status } = await recordRun(sb, email, task, run, effects);
      return { id: task.id, status };
    } finally {
      await sb.from("gateway_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash);
    }
  }));
  return Response.json({ worked: results });
}
