// The assistant's working checklist for one request. The model plans steps and
// asks to tick them, but the server decides: a step that needs a tool is only
// accepted as done when a tool call made while it was active came back
// successful and the latest one did not fail. "I sent it" with no successful
// send, or a send still waiting on the user's Confirm, is refused, so a
// checklist that reads complete is complete.

export type StepStatus = "pending" | "active" | "done" | "failed" | "awaiting";

export interface Step {
  id: number;
  title: string;
  verify: string;
  needsTool: boolean;
  status: StepStatus;
  evidence?: string;
  note?: string;
}

export type Outcome = "ok" | "failed" | "awaiting";

export const CHECKLIST_TOOLS = new Set(["plan_checklist", "start_step", "complete_step", "fail_step"]);

// Handlers report trouble in their first words ("Couldn't …", "[News error …]",
// "Need a …", "Not signed in"); content further in is the user's data and may
// say "error" legitimately.
const FAILED = /^\s*(\[[^\]\n]{0,60}\b(error|failed|unavailable)\b|⚠|❌|error\b|failed\b|\w+ failed\b|couldn'?t\b|could not\b|cannot\b|can'?t\b|unable\b|sorry\b|need (a|an|the)\b|no \w+ named\b|no such\b|not signed in|unknown\b|no handler|i don'?t have a handler|that's a jarvis premium)|\b(isn'?t connected|not connected|not configured|is not set)\b/i;

export function classifyResult(result: string): Outcome {
  if (/^Proposed to the user for confirmation/.test(result)) return "awaiting";
  return FAILED.test(result.slice(0, 160)) ? "failed" : "ok";
}

function parseSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((r: any, i) => {
    const title = String(r?.title ?? "").trim().slice(0, 160);
    if (!title) return [];
    return [{
      id: i + 1,
      title,
      verify: String(r?.verify ?? "").trim().slice(0, 200) || "Check the result directly",
      needsTool: r?.needsTool !== false,
      // Only "done" survives a turn: a tick earned earlier stays earned, while
      // anything awaiting Confirm or failed has to be checked again now.
      status: (r?.status === "done" ? "done" : "pending") as StepStatus,
      evidence: r?.status === "done" ? String(r?.evidence ?? "").slice(0, 280) : undefined,
    }];
  });
}

// The model sees what is left, so "continue" resumes at the first open step.
export function resumeNote(raw: unknown): string {
  const steps = parseSteps(raw);
  if (!steps.some((s) => s.status !== "done")) return "";
  const lines = steps.map((s) => `${s.id}. [${s.status === "done" ? "x" : " "}] ${s.title} — verify: ${s.verify}`);
  return `\n\n**Checklist carried over from your last reply** (already loaded — don't re-plan unless the user changed the request; start_step the first open one):\n${lines.join("\n")}`;
}

export class Checklist {
  static resume(raw: unknown): Checklist {
    const c = new Checklist();
    const steps = parseSteps(raw);
    if (steps.some((s) => s.status !== "done")) c.steps = steps;
    return c;
  }

  steps: Step[] = [];
  private active: number | null = null;
  private outcomes = new Map<number, Outcome[]>();

  get planned() { return this.steps.length > 0; }

  apply(name: string, args: any): string {
    switch (name) {
      case "plan_checklist": return this.plan(args);
      case "start_step": return this.start(Number(args?.step));
      case "complete_step": return this.complete(Number(args?.step), String(args?.evidence ?? ""));
      case "fail_step": return this.fail(Number(args?.step), String(args?.reason ?? ""));
    }
    return `Unknown checklist tool ${name}.`;
  }

  private plan(args: any): string {
    const raw = Array.isArray(args?.steps) ? args.steps : [];
    const steps = raw
      .map((s: any) => (typeof s === "string" ? { title: s } : s))
      .filter((s: any) => String(s?.title ?? "").trim())
      .slice(0, 20);
    if (!steps.length) return "plan_checklist needs at least one step with a title.";
    const done = this.steps.filter((s) => s.status === "done");
    this.steps = [
      ...done,
      ...steps.map((s: any, i: number) => ({
        id: done.length + i + 1,
        title: String(s.title).trim().slice(0, 160),
        verify: String(s.verify ?? "").trim().slice(0, 200) || "Check the result directly",
        needsTool: s.needs_tool !== false,
        status: "pending" as StepStatus,
      })),
    ];
    this.active = null;
    return `Checklist set with ${this.steps.length} step(s). Work them in order: start_step, do the work with tools, check the result, then complete_step with the evidence.`;
  }

  private find(id: number): Step | undefined {
    return this.steps.find((s) => s.id === id);
  }

  private start(id: number): string {
    const step = this.find(id);
    if (!step) return `There is no step ${id}.`;
    if (step.status === "done") return `Step ${id} is already verified done.`;
    if (this.active !== null && this.active !== id) {
      const prev = this.find(this.active);
      if (prev && prev.status === "active") prev.status = "pending";
    }
    step.status = "active";
    step.note = undefined;
    this.active = id;
    return `Step ${id} started: ${step.title}. Verify by: ${step.verify}.`;
  }

  // Tool calls made without an explicit start_step belong to the first open step.
  record(outcome: Outcome) {
    if (!this.planned) return;
    if (this.active === null) {
      const next = this.steps.find((s) => s.status !== "done");
      if (!next) return;
      this.start(next.id);
    }
    const list = this.outcomes.get(this.active!) ?? [];
    list.push(outcome);
    this.outcomes.set(this.active!, list);
    const step = this.find(this.active!)!;
    if (outcome === "awaiting") step.status = "awaiting";
    else if (step.status === "awaiting" && outcome === "ok") step.status = "active";
  }

  private complete(id: number, evidence: string): string {
    const step = this.find(id);
    if (!step) return `There is no step ${id}.`;
    if (step.status === "done") return `Step ${id} is already verified done.`;
    if (evidence.trim().length < 8) {
      return `Not ticked: step ${id} needs evidence — quote what the tool returned that proves "${step.verify}".`;
    }
    if (step.needsTool) {
      const seen = this.outcomes.get(id) ?? [];
      if (!seen.length) return `Not ticked: no tool has run for step ${id} yet. Do the work, check it, then complete it.`;
      const last = seen[seen.length - 1];
      if (last === "awaiting") {
        step.status = "awaiting";
        return `Not ticked: step ${id} is waiting for the user's Confirm. Tell them it is ready to confirm; it is not done until they do.`;
      }
      if (last === "failed") {
        return `Not ticked: the last tool call for step ${id} failed. Fix the cause, retry, verify, then complete it — or fail_step with the reason if it cannot be done.`;
      }
      if (!seen.includes("ok")) return `Not ticked: no successful tool result for step ${id}.`;
    }
    step.status = "done";
    step.evidence = evidence.trim().slice(0, 280);
    step.note = undefined;
    if (this.active === id) this.active = null;
    const left = this.steps.filter((s) => s.status !== "done").length;
    return left ? `Step ${id} verified and ticked. ${left} step(s) left.` : "All steps verified and ticked.";
  }

  private fail(id: number, reason: string): string {
    const step = this.find(id);
    if (!step) return `There is no step ${id}.`;
    if (step.status === "done") return `Step ${id} is already verified done.`;
    step.status = "failed";
    step.note = reason.trim().slice(0, 280) || "failed";
    if (this.active === id) this.active = null;
    return `Step ${id} marked failed. Try a different approach and start_step ${id} again, or tell the user exactly what blocks it.`;
  }

  snapshot(): Step[] {
    return this.steps.map((s) => ({ ...s }));
  }

  // What the user is told when the turn ends with steps not verified, so a
  // closing "all done!" can never outrun the ledger.
  shortfall(): string | null {
    if (!this.planned) return null;
    const open = this.steps.filter((s) => s.status !== "done");
    if (!open.length) return null;
    const done = this.steps.length - open.length;
    const lines = open.map((s) => {
      const why = s.status === "awaiting" ? "waiting for your Confirm" : s.status === "failed" ? `failed — ${s.note}` : "not verified yet";
      return `- ${s.id}. ${s.title} (${why})`;
    });
    return `\n\n**Checklist: ${done}/${this.steps.length} verified.** Still open:\n${lines.join("\n")}`;
  }
}

export const CHECKLIST_INSTRUCTION = `**Verified checklist (mandatory for real work).** For any request that needs more than one step or changes anything outside this chat (sending mail, calendar, tasks, files, code, research reports, purchases), first call plan_checklist with every small step and how each will be verified. Then for each step in order: start_step → do it with tools → check the outcome with a tool where one exists (re-read the created item, list what you saved, fetch the page) → complete_step with the evidence you saw. The server refuses to tick a step without a successful tool result, after a failed call, or while it waits for the user's Confirm. When a step fails, find the cause, fix it, retry and re-verify; use fail_step only when it truly cannot be done, and say why. Steps that are pure reasoning or writing may be planned with needs_tool=false. Never say a task is done unless every step is ticked. Single quick answers (a fact, a calculation, a greeting) need no checklist.`;
