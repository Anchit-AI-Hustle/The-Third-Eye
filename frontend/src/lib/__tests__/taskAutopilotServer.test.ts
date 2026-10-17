import { describe, expect, it } from "vitest";
import { dueForRun, failedAttempts, MAX_ATTEMPTS, RETRY_AFTER_MS } from "@/lib/taskAutopilotServer";
import { STALE_MS, workOrder } from "@/lib/taskAutopilot";

const now = Date.parse("2026-10-17T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const failedLine = "[2026-10-17 06:00 · Autopilot] JARVIS couldn't work on it: providers down";

describe("which tasks the autopilot takes", () => {
  it("takes a task it has never worked", () => {
    expect(dueForRun({ status: "todo", autopilot_status: null }, now)).toBe(true);
  });

  it("takes back a run cut off mid-way only once it is stale", () => {
    expect(dueForRun({ status: "todo", autopilot_status: "running", autopilot_at: ago(STALE_MS - 1000) }, now)).toBe(false);
    expect(dueForRun({ status: "todo", autopilot_status: "running", autopilot_at: ago(STALE_MS + 1000) }, now)).toBe(true);
  });

  it("retries a failed run after a wait, up to the attempt limit", () => {
    const failed = { status: "todo", autopilot_status: "failed", all_updates: failedLine };
    expect(dueForRun({ ...failed, autopilot_at: ago(RETRY_AFTER_MS - 1000) }, now)).toBe(false);
    expect(dueForRun({ ...failed, autopilot_at: ago(RETRY_AFTER_MS + 1000) }, now)).toBe(true);
    const spent = { ...failed, all_updates: Array(MAX_ATTEMPTS).fill(failedLine).join("\n"), autopilot_at: ago(RETRY_AFTER_MS + 1000) };
    expect(failedAttempts(spent)).toBe(MAX_ATTEMPTS);
    expect(dueForRun(spent, now)).toBe(false);
  });

  it("leaves tasks that need the user, finished tasks and its own follow-ups alone", () => {
    expect(dueForRun({ status: "in_progress", autopilot_status: "needs_you" }, now)).toBe(false);
    expect(dueForRun({ status: "done", autopilot_status: "done" }, now)).toBe(false);
    expect(dueForRun({ status: "todo", autopilot_status: null, source_type: "Autopilot" }, now)).toBe(false);
  });

  it("works urgent and overdue tasks first", () => {
    const order = workOrder([
      { id: "low", priority: "low", due_date: "2026-01-01" },
      { id: "urgent-later", priority: "urgent", due_date: "2026-12-01" },
      { id: "high", priority: "high", due_date: null },
      { id: "urgent-overdue", priority: "urgent", due_date: "2026-09-01" },
    ]).map((t) => t.id);
    expect(order).toEqual(["urgent-overdue", "urgent-later", "high", "low"]);
  });
});
