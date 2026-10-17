import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { AutopilotRun } from "@/lib/taskAutopilot";
import { claimTask, recordRun, TASK_COLUMNS } from "@/lib/taskAutopilotServer";

export const runtime = "nodejs";

// The browser runs each task through /api/chat (it has the session); this route
// claims a task so only one runner works it, and records the outcome.

type Effect = { type: string; data?: Record<string, unknown> };

export async function POST(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const sb = getDb();
  if (!sb) return Response.json({ error: "Task autopilot needs the database." }, { status: 501 });

  const body = (await req.json().catch(() => null)) as { taskId?: string; action?: string; run?: AutopilotRun; effects?: Effect[]; agentName?: string } | null;
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  if (!taskId) return Response.json({ error: "taskId required" }, { status: 400 });

  const { data: task } = await sb.from("tasks").select(TASK_COLUMNS).eq("user_id", email).eq("id", taskId).maybeSingle();
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

  if (body!.action === "claim") {
    const claimed = await claimTask(sb, email, task);
    return Response.json({ claimed: Boolean(claimed), task: claimed ?? undefined });
  }
  if (body!.action === "finish" && body!.run) {
    return Response.json(await recordRun(sb, email, task, body!.run, Array.isArray(body!.effects) ? body!.effects : [], body!.agentName));
  }
  if (body!.action === "reset") {
    await sb.from("tasks").update({ autopilot_status: null, autopilot_report: null }).eq("user_id", email).eq("id", taskId);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
