import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applySideEffects } from "@/lib/whatsapp";
import { judgeRun, STALE_MS, type AutopilotRun } from "@/lib/taskAutopilot";

export const runtime = "nodejs";

// The browser runs each task through /api/chat (it has the session); this route
// claims a task so only one tab works it, and records the outcome.

const SOURCE = "Autopilot";

type Effect = { type: string; data?: Record<string, unknown> };

export async function POST(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const sb = getDb();
  if (!sb) return Response.json({ error: "Task autopilot needs the database." }, { status: 501 });

  const body = (await req.json().catch(() => null)) as { taskId?: string; action?: string; run?: AutopilotRun; effects?: Effect[] } | null;
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  if (!taskId) return Response.json({ error: "taskId required" }, { status: 400 });

  const { data: row } = await sb.from("tasks").select("id, title, description, due_date, priority, status, all_updates, autopilot_status, autopilot_at, source_type")
    .eq("user_id", email).eq("id", taskId).maybeSingle();
  const task = row as Record<string, any> | null;
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  const now = new Date().toISOString();

  if (body!.action === "claim") {
    const running = task.autopilot_status === "running" && Date.now() - new Date(task.autopilot_at ?? 0).getTime() < STALE_MS;
    if (running || task.status === "done" || task.status === "cancelled") return Response.json({ claimed: false });
    // Conditional on the status read above, so two tabs never both win.
    const q = sb.from("tasks").update({ autopilot_status: "running", autopilot_at: now }).eq("user_id", email).eq("id", taskId);
    const { data } = await (task.autopilot_status == null ? q.is("autopilot_status", null) : q.eq("autopilot_status", task.autopilot_status)).select("id");
    const claimed = Array.isArray(data) && data.length > 0;
    return Response.json({ claimed, task: claimed ? { id: task.id, title: task.title, description: task.description, due_date: task.due_date, priority: task.priority, retry: task.autopilot_status === "running" } : undefined });
  }

  if (body!.action === "finish" && body!.run) {
    const run = body!.run;
    const { status, report } = judgeRun({
      text: String(run.text ?? ""),
      checklist: Array.isArray(run.checklist) ? run.checklist : [],
      confirms: Array.isArray(run.confirms) ? run.confirms : [],
      stopReason: run.stopReason,
      error: run.error,
    });
    const effects = Array.isArray(body!.effects) ? body!.effects : [];
    // Follow-ups it creates are tagged so the autopilot does not work them in turn.
    await applySideEffects(email, effects.filter((e) => !(e.type === "task_update" && e.data?.id === taskId) && !(e.type === "task_delete" && e.data?.id === taskId)), SOURCE);
    for (const f of effects.filter((e) => e.type === "file" && typeof e.data?.content === "string")) {
      await sb.from("knowledge_docs").insert({
        id: crypto.randomUUID(), user_id: email, title: String(f.data!.filename ?? task.title), content: String(f.data!.content),
        file_type: String(f.data!.mime ?? "text/plain"), file_size_bytes: String(f.data!.content).length, chunk_count: 1,
        processing_status: "ready", created_at: now,
      });
    }
    const label = status === "done" ? "Done by JARVIS" : status === "needs_you" ? "JARVIS worked on it; needs you" : "JARVIS couldn't work on it";
    const line = `[${now.slice(0, 16).replace("T", " ")} · ${SOURCE}] ${label}: ${report.split("\n")[0].slice(0, 200)}`;
    const patch: Record<string, unknown> = {
      autopilot_status: status, autopilot_report: report, autopilot_at: now, updated_at: now,
      all_updates: task.all_updates ? `${task.all_updates}\n${line}` : line,
    };
    if (status === "done") { patch.status = "done"; patch.completed_at = now.slice(0, 10); }
    else if (status === "needs_you" && task.status === "todo") patch.status = "in_progress";
    await sb.from("tasks").update(patch).eq("user_id", email).eq("id", taskId);
    return Response.json({ status, report });
  }

  if (body!.action === "reset") {
    await sb.from("tasks").update({ autopilot_status: null, autopilot_report: null }).eq("user_id", email).eq("id", taskId);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
