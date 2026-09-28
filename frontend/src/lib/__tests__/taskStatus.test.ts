import { describe, expect, it } from "vitest";

import { TASK_STATUSES, taskStatusLabel } from "@/lib/taskStatus";
import { geminiTools } from "@/lib/tools/schemas";

// The dashboard used to render `status === "in_progress" ? "In Progress" :
// "To Do"`, so a task in review read there as untouched. These pin the two
// places a new status has to reach: the shared label map, and the tool enum
// the assistant is allowed to write.

describe("taskStatusLabel", () => {
  it("labels every status the tracker offers", () => {
    expect(taskStatusLabel("todo")).toBe("To Do");
    expect(taskStatusLabel("in_progress")).toBe("In Progress");
    expect(taskStatusLabel("review")).toBe("In Review");
    expect(taskStatusLabel("done")).toBe("Done");
    expect(taskStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("never renders a real status as another one", () => {
    const labels = TASK_STATUSES.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("falls back for an unknown or missing status rather than rendering blank", () => {
    expect(taskStatusLabel(undefined)).toBe("To Do");
    expect(taskStatusLabel("something_else")).toBe("To Do");
  });
});

describe("manage_tasks tool schema", () => {
  it("lets the assistant write every status the tracker shows", () => {
    type Decl = { name: string; parameters?: { properties?: Record<string, { enum?: string[] }> } };
    const decls: Decl[] = geminiTools.flatMap((t: { functionDeclarations: unknown[] }) => t.functionDeclarations as Decl[]);
    const manage = decls.find((d: Decl) => d.name === "manage_tasks");
    expect(manage, "manage_tasks is not declared").toBeTruthy();
    const allowed = manage?.parameters?.properties?.status?.enum ?? [];
    for (const { value } of TASK_STATUSES) {
      expect(allowed, `assistant cannot set status "${value}"`).toContain(value);
    }
  });
});
