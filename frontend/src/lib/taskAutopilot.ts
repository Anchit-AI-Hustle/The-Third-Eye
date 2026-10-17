import type { Step } from "@/lib/checklist";

// Task autopilot: JARVIS works every new task through the assistant's own tool
// loop. A run counts as done only when every planned step was ticked with
// evidence and nothing is waiting for the user's approval; anything less is
// reported as "needs you", with what was done and what is left.

// A run older than this is from a tab that closed mid-task, so it may be retried.
export const STALE_MS = 10 * 60_000;

/** Marks a chat turn as autopilot's, so the chat route never sends on its behalf. */
export const AUTOPILOT_PREFIX = "AUTOPILOT:";

/** Starts the report of a run that no AI provider could do; it is retried, not left for the user. */
export const NO_PROVIDER = "No AI provider was free to work on this";

export type AutopilotStatus = "running" | "done" | "needs_you" | "failed";

export interface AutopilotTask {
  id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: string | null;
  /** A run of this task stopped part-way before (a tab closed mid-task). */
  retry?: boolean;
}

export interface AutopilotRun {
  text: string;
  checklist: Step[];
  confirms: { summary: string }[];
  links?: { label: string; url: string }[];
  stopReason?: string;
  error?: string;
}

export function autopilotPrompt(t: AutopilotTask): string {
  return [
    `${AUTOPILOT_PREFIX} complete this task from my Task Tracker now, without me watching.`,
    `Task: ${t.title}`,
    t.description ? `Details: ${t.description}` : "",
    t.due_date ? `Due: ${t.due_date}` : "",
    t.priority ? `Priority: ${t.priority}` : "",
    t.retry ? `This task was started before and stopped part-way. Before creating any reminder, note, event or file, check what already exists (list reminders, search notes and knowledge) and do not make it twice.` : "",
    ``,
    `How to work:`,
    `- Plan concrete steps with plan_checklist, then do each one with your tools, check the result, and tick it with complete_step quoting the evidence.`,
    `- Do the real work: research, write the drafts, documents or files, set the reminders, prepare the messages. Files you save go to my Knowledge base.`,
    `- Sending, paying or anything else that needs my approval: prepare it fully and propose it; it will wait for me.`,
    `- If part of it needs me in person, prepare everything you can and say exactly what is left for me.`,
    `- Do not create, update or complete this task in the tracker yourself; the app records the outcome.`,
    `- End with a short report: what you did, the result, and anything left for me. Never claim something you did not verify.`,
  ].filter((l) => l !== "").join("\n");
}

// Pure, so the rule is testable and the same wherever it runs.
export function judgeRun(run: AutopilotRun): { status: AutopilotStatus; report: string } {
  const verified = run.checklist.filter((s) => s.status === "done");
  const open = run.checklist.filter((s) => s.status !== "done");
  const lines: string[] = [];
  if (run.text.trim()) lines.push(run.text.trim().slice(0, 4000));
  if (verified.length) lines.push(`Verified:\n${verified.map((s) => `- ${s.title}${s.evidence ? `: ${s.evidence}` : ""}`).join("\n")}`);
  if (open.length) lines.push(`Not verified:\n${open.map((s) => `- ${s.title}${s.note ? ` (${s.note})` : ""}`).join("\n")}`);
  if (run.links?.length) lines.push(`Ready for you to open:\n${run.links.map((l) => `- ${l.label}: ${l.url}`).join("\n")}`);
  if (run.confirms.length) lines.push(`Waiting for your approval:\n${run.confirms.map((c) => `- ${c.summary}`).join("\n")}`);

  if (run.error) return { status: "failed", report: [`JARVIS couldn't work on this: ${run.error}`, ...lines].join("\n\n") };
  // "fallback" is chat's text-only reply when no provider can run tools; "no_provider" is when none answered at all.
  if ((run.stopReason === "fallback" || run.stopReason === "no_provider") && !run.checklist.length && !run.confirms.length) {
    return { status: "failed", report: [`${NO_PROVIDER}, so JARVIS will try again when one is.`, ...lines].join("\n\n") };
  }
  const finished = run.checklist.length > 0 && open.length === 0 && run.confirms.length === 0
    && !["partial", "max_steps", "fallback"].includes(run.stopReason ?? "");
  if (!finished && !run.checklist.length && !run.confirms.length) lines.push("No step could be verified, so this is not marked done.");
  return { status: finished ? "done" : "needs_you", report: lines.join("\n\n") };
}

type Effect = { type: string; data?: Record<string, any> };

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Urgent first, then high; within a priority the earliest (most overdue) due date first. */
export function workOrder<T extends { priority?: string | null; due_date?: string | null }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) =>
    (PRIORITY_RANK[a.priority ?? ""] ?? 4) - (PRIORITY_RANK[b.priority ?? ""] ?? 4)
    || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
}

/** Where to reach /api/chat: the browser's own session, or a server run with a scoped bearer token. */
export interface ChatTarget { url: string; headers?: Record<string, string>; timezone: string; signal?: AbortSignal }

/** One autopilot turn through /api/chat as the given agent, read off its event stream. Each call is its own conversation. */
export async function runThroughChat(task: AutopilotTask, agent?: { id: string; name: string; personality: string }, target?: ChatTarget): Promise<{ run: AutopilotRun; effects: Effect[] }> {
  const run: AutopilotRun = { text: "", checklist: [], confirms: [], links: [] };
  let effects: Effect[] = [];
  try {
    const res = await fetch(target?.url ?? "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...target?.headers },
      signal: target?.signal,
      body: JSON.stringify({
        message: autopilotPrompt(task), history: [], timezone: target?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(agent ? { agentId: agent.id, agentName: agent.name, agentPersona: agent.personality } : {}),
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { run: { ...run, error: d.error ?? `the assistant answered ${res.status}` }, effects };
    }
    for (const block of (await res.text()).split("\n\n")) {
      const event = block.match(/^event: (\w+)/m)?.[1];
      const raw = block.match(/^data: (.*)$/m)?.[1];
      if (!event || !raw) continue;
      const data = JSON.parse(raw);
      if (event === "text") run.text += data.text ?? "";
      else if (event === "checklist" && Array.isArray(data.steps)) run.checklist = data.steps;
      else if (event === "confirm") run.confirms.push({ summary: String(data.summary ?? data.tool) });
      else if (event === "error" && data.code === "no_provider") run.stopReason = "no_provider";
      else if (event === "error") run.error = String(data.message ?? "the assistant failed");
      else if (event === "done") {
        effects = data.sideEffects ?? [];
        run.stopReason = data.stop_reason;
        if (Array.isArray(data.checklist) && data.checklist.length) run.checklist = data.checklist;
      }
    }
  } catch (e) {
    run.error = e instanceof Error ? e.message : "network error";
  }
  run.links = effects.filter((e) => e.type === "open_url" && typeof e.data?.url === "string")
    .map((e) => ({ label: String(e.data!.label ?? "Link"), url: String(e.data!.url) }));
  return { run, effects };
}
