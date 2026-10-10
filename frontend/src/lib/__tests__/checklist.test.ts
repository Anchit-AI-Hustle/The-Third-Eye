import { describe, expect, it } from "vitest";
import { Checklist, classifyResult, resumeNote } from "@/lib/checklist";

const plan = (c: Checklist) =>
  c.apply("plan_checklist", {
    steps: [
      { title: "Create the event", verify: "list Friday's events" },
      { title: "Email the invite", verify: "appears in Sent" },
      { title: "Summarise for the user", verify: "reply written", needs_tool: false },
    ],
  });

describe("classifyResult", () => {
  it("reads a handler's own failure phrasing, not words inside the user's data", () => {
    expect(classifyResult("Couldn't build the calendar link — missing details.")).toBe("failed");
    expect(classifyResult("[News fetch failed: timeout]")).toBe("failed");
    expect(classifyResult("Calculation failed: bad input")).toBe("failed");
    expect(classifyResult("GitHub isn't connected. The connect screen is open.")).toBe("failed");
    expect(classifyResult("Need a UPI id and amount to proceed")).toBe("failed");
    expect(classifyResult("Proposed to the user for confirmation: Email a@b.c")).toBe("awaiting");
    expect(classifyResult("Task created: Fix the error page (id t1)")).toBe("ok");
    expect(classifyResult("3 results: How to fix error 404 …")).toBe("ok");
  });
});

describe("Checklist", () => {
  it("refuses a tick with no tool run, after a failure, or while awaiting Confirm", () => {
    const c = new Checklist();
    plan(c);
    expect(c.apply("complete_step", { step: 1, evidence: "Event is on the calendar" })).toMatch(/no tool has run/);
    c.apply("start_step", { step: 1 });
    c.record("failed");
    expect(c.apply("complete_step", { step: 1, evidence: "Event is on the calendar" })).toMatch(/last tool call .* failed/);
    c.record("ok");
    expect(c.apply("complete_step", { step: 1, evidence: "short" })).toMatch(/needs evidence/);
    expect(c.apply("complete_step", { step: 1, evidence: "events.list shows 'Review' Fri 3pm" })).toMatch(/verified and ticked/);

    c.apply("start_step", { step: 2 });
    c.record("awaiting");
    expect(c.snapshot()[1].status).toBe("awaiting");
    expect(c.apply("complete_step", { step: 2, evidence: "Email drafted and proposed" })).toMatch(/waiting for the user's Confirm/);
    expect(c.snapshot()[1].status).toBe("awaiting");
  });

  it("attributes work to the first open step when the model skips start_step", () => {
    const c = new Checklist();
    plan(c);
    c.record("ok");
    expect(c.snapshot()[0].status).toBe("active");
    expect(c.apply("complete_step", { step: 1, evidence: "the event exists on Friday" })).toMatch(/ticked/);
  });

  it("lets reasoning steps be ticked on evidence alone", () => {
    const c = new Checklist();
    plan(c);
    expect(c.apply("complete_step", { step: 3, evidence: "Summary written below" })).toMatch(/ticked/);
  });

  it("reports what is still open instead of letting the reply claim it is done", () => {
    const c = new Checklist();
    expect(c.shortfall()).toBeNull();
    plan(c);
    c.record("ok");
    c.apply("complete_step", { step: 1, evidence: "the event exists on Friday" });
    c.apply("fail_step", { step: 2, reason: "Gmail not connected" });
    const gap = c.shortfall()!;
    expect(gap).toContain("1/3 verified");
    expect(gap).toContain("Email the invite (failed — Gmail not connected)");
    expect(gap).toContain("Summarise for the user (not verified yet)");
  });

  it("re-planning keeps verified steps and renumbers the rest after them", () => {
    const c = new Checklist();
    plan(c);
    c.record("ok");
    c.apply("complete_step", { step: 1, evidence: "the event exists on Friday" });
    c.apply("plan_checklist", { steps: [{ title: "Send via WhatsApp instead", verify: "user confirms" }] });
    expect(c.snapshot().map((s) => [s.id, s.status])).toEqual([[1, "done"], [2, "pending"]]);
  });

  it("re-planning neither leaks old tool results into new steps nor duplicates ids", () => {
    const c = new Checklist();
    plan(c);
    c.apply("start_step", { step: 3 });
    c.record("ok");
    c.apply("complete_step", { step: 3, evidence: "Summary written below" });
    c.apply("start_step", { step: 2 });
    c.record("ok");
    c.apply("plan_checklist", { steps: [{ title: "New A", verify: "a" }, { title: "New B", verify: "b" }] });
    expect(c.snapshot().map((s) => [s.id, s.title, s.status])).toEqual([[1, "Summarise for the user", "done"], [2, "New A", "pending"], [3, "New B", "pending"]]);
    expect(c.apply("complete_step", { step: 2, evidence: "inherited from before" })).toMatch(/no tool has run/);
  });

  it("carries only earned ticks into the next turn", () => {
    const c = new Checklist();
    plan(c);
    c.record("ok");
    c.apply("complete_step", { step: 1, evidence: "the event exists on Friday" });
    c.apply("start_step", { step: 2 });
    c.record("awaiting");
    const resumed = Checklist.resume(c.snapshot());
    expect(resumed.snapshot().map((s) => s.status)).toEqual(["done", "pending", "pending"]);
    expect(resumeNote(c.snapshot())).toContain("1. [x] Create the event");
    expect(Checklist.resume(resumed.snapshot().map((s) => ({ ...s, status: "done" }))).planned).toBe(false);
    expect(Checklist.resume("garbage").planned).toBe(false);
  });

  it("rejects an empty plan and unknown steps", () => {
    const c = new Checklist();
    expect(c.apply("plan_checklist", { steps: [] })).toMatch(/at least one step/);
    plan(c);
    expect(c.apply("complete_step", { step: 9, evidence: "whatever it is" })).toMatch(/no step 9/);
  });
});

describe("classifyResult on tool output that opens with a bracket", () => {
  it("only fails a bracket that reports an error", () => {
    expect(classifyResult('[{"id":"evt1","summary":"Design review"}]')).toBe("ok");
    expect(classifyResult("[Q3 report](https://mail.google.com/x) from Priya")).toBe("ok");
    expect(classifyResult("[Stock error: HTTP 500]")).toBe("failed");
    expect(classifyResult("[Weather unavailable — no key]")).toBe("failed");
  });
});
