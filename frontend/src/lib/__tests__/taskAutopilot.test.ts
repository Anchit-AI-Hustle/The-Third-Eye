import { describe, expect, it } from "vitest";
import { autopilotPrompt, judgeRun, NO_PROVIDER } from "@/lib/taskAutopilot";
import type { Step } from "@/lib/checklist";

const step = (id: number, title: string, status: Step["status"], evidence?: string): Step => ({ id, title, verify: "", needsTool: true, status, evidence });

describe("task autopilot outcome", () => {
  it("is done only when every planned step was verified and nothing waits for approval", () => {
    const r = judgeRun({ text: "Booked it.", checklist: [step(1, "Find slot", "done", "10:00 free"), step(2, "Set reminder", "done", "Reminder set")], confirms: [], stopReason: "end_turn" });
    expect(r.status).toBe("done");
    expect(r.report).toContain("Find slot: 10:00 free");
  });

  it("needs the user when a step is unverified", () => {
    const r = judgeRun({ text: "", checklist: [step(1, "Draft", "done", "ok"), step(2, "Send", "failed")], confirms: [] });
    expect(r.status).toBe("needs_you");
    expect(r.report).toMatch(/Not verified:\n- Send/);
  });

  it("needs the user when a send or payment is waiting for approval", () => {
    const r = judgeRun({ text: "Drafted.", checklist: [step(1, "Draft email", "done", "draft ready")], confirms: [{ summary: "Send an email to a@b.com" }] });
    expect(r.status).toBe("needs_you");
    expect(r.report).toContain("Waiting for your approval:\n- Send an email to a@b.com");
  });

  it("never marks done a run with no verified steps", () => {
    expect(judgeRun({ text: "All done!", checklist: [], confirms: [] })).toMatchObject({ status: "needs_you" });
  });

  it("does not trust a run that was cut short", () => {
    expect(judgeRun({ text: "", checklist: [step(1, "A", "done", "x")], confirms: [], stopReason: "partial" }).status).toBe("needs_you");
  });

  it("treats a text-only reply with no provider for tools as an outage to retry, not work for the user", () => {
    const r = judgeRun({ text: "Live actions are temporarily unavailable.", checklist: [], confirms: [], stopReason: "fallback" });
    expect(r.status).toBe("failed");
    expect(r.report.startsWith(NO_PROVIDER)).toBe(true);
  });

  it("treats chat's every-provider-failed reply as an outage to retry", () => {
    const r = judgeRun({ text: "", checklist: [], confirms: [], stopReason: "no_provider" });
    expect(r.status).toBe("failed");
    expect(r.report.startsWith(NO_PROVIDER)).toBe(true);
  });

  it("reports a failure plainly", () => {
    expect(judgeRun({ text: "", checklist: [], confirms: [], error: "agent stopped" })).toMatchObject({ status: "failed", report: expect.stringContaining("agent stopped") });
  });

  it("lists the links it prepared", () => {
    const r = judgeRun({ text: "", checklist: [], confirms: [], links: [{ label: "WhatsApp Priya", url: "https://wa.me/91" }] });
    expect(r.report).toContain("Ready for you to open:\n- WhatsApp Priya: https://wa.me/91");
  });

  it("asks for the work itself, with evidence, and leaves the tracker to the app", () => {
    const p = autopilotPrompt({ id: "t", title: "Plan Goa trip", due_date: "2026-11-01" });
    expect(p).toContain("Task: Plan Goa trip");
    expect(p).toContain("Due: 2026-11-01");
    expect(p).toMatch(/plan_checklist/);
    expect(p).toMatch(/Do not create, update or complete this task/);
  });

  it("tells a retried run to check what it already made before making it again", () => {
    expect(autopilotPrompt({ id: "t", title: "Book dentist" })).not.toMatch(/started before/);
    expect(autopilotPrompt({ id: "t", title: "Book dentist", retry: true })).toMatch(/started before and stopped part-way[\s\S]*do not make it twice/);
  });
});
