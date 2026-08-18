import { describe, expect, it } from "vitest";

import { withCompletionStamp } from "@/hooks/useLocalTasks";

// The tracker has a Completed column and the dashboard counts "completed
// today", but only the device-log importer ever set completed_at. Finishing a
// task by dragging it, by the row button, or by asking the assistant left the
// column at "—" and the dashboard count at zero forever.

const today = new Date().toISOString().slice(0, 10);

describe("finishing a task", () => {
  it("stamps the completion date", () => {
    expect(withCompletionStamp({ status: "done" })).toEqual({ status: "done", completed_at: today });
  });

  it("does not override a date the user typed in the edit form", () => {
    expect(withCompletionStamp({ status: "done", completed_at: "2026-01-05" }).completed_at).toBe("2026-01-05");
  });

  it("respects an explicitly cleared date", () => {
    expect(withCompletionStamp({ status: "done", completed_at: "" }).completed_at).toBe("");
  });
});

describe("un-finishing a task", () => {
  it.each(["todo", "in_progress", "cancelled"] as const)(
    "clears the completion date when moved to %s",
    (status) => {
      // Dragging a card back out of Done must not leave a finish date on work
      // that is not finished — the dashboard would keep counting it.
      expect(withCompletionStamp({ status }).completed_at).toBe("");
    },
  );
});

describe("edits that are not status changes", () => {
  it("leaves the patch alone", () => {
    const patch = { priority: "high" as const, due_date: "2026-09-01" };
    expect(withCompletionStamp(patch)).toBe(patch);
  });
});
