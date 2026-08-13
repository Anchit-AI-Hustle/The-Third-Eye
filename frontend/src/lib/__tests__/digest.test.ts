import { describe, it, expect } from "vitest";
import { leadRecommendation, escapeHtml, type DigestTask, type DigestGoal } from "@/lib/digest";

const TODAY = "2026-08-13";

function task(over: Partial<DigestTask> = {}): DigestTask {
  return { title: "Task", status: "todo", priority: "medium", due_date: null, ...over };
}

describe("leadRecommendation", () => {
  it("returns null when there is nothing to lead with", () => {
    expect(leadRecommendation([], [], TODAY)).toBeNull();
  });

  it("leads with the overdue task", () => {
    const lead = leadRecommendation([task({ title: "File GST", due_date: "2026-08-10" })], [], TODAY);
    expect(lead?.text).toBe("Start with File GST — it's 3 days overdue.");
  });

  it("uses the singular for one day overdue", () => {
    const lead = leadRecommendation([task({ title: "Call bank", due_date: "2026-08-12" })], [], TODAY);
    expect(lead?.text).toContain("1 day overdue");
    expect(lead?.text).not.toContain("1 days");
  });

  it("ranks by priority before due date among overdue tasks", () => {
    const lead = leadRecommendation(
      [
        task({ title: "Old but low", priority: "low", due_date: "2026-08-01" }),
        task({ title: "Recent but urgent", priority: "urgent", due_date: "2026-08-12" }),
      ],
      [],
      TODAY,
    );
    expect(lead?.text).toContain("Recent but urgent");
  });

  it("counts the other overdue tasks behind the lead", () => {
    const tasks = [
      task({ title: "A", priority: "urgent", due_date: "2026-08-01" }),
      task({ title: "B", due_date: "2026-08-02" }),
      task({ title: "C", due_date: "2026-08-03" }),
    ];
    expect(leadRecommendation(tasks, [], TODAY)?.text).toContain("2 others are behind it");
  });

  it("uses the singular when exactly one task trails the lead", () => {
    const tasks = [
      task({ title: "A", priority: "urgent", due_date: "2026-08-01" }),
      task({ title: "B", due_date: "2026-08-02" }),
    ];
    expect(leadRecommendation(tasks, [], TODAY)?.text).toContain("1 other is behind it");
  });

  it("falls through to tasks due today when nothing is overdue", () => {
    const lead = leadRecommendation([task({ title: "Ship audit", due_date: TODAY })], [], TODAY);
    expect(lead?.text).toBe("Start with Ship audit — due today.");
  });

  it("ignores done and cancelled tasks", () => {
    const tasks = [
      task({ title: "Finished", status: "done", due_date: "2026-08-01" }),
      task({ title: "Dropped", status: "cancelled", due_date: "2026-08-02" }),
    ];
    expect(leadRecommendation(tasks, [], TODAY)).toBeNull();
  });

  it("suggests getting ahead only on a high-priority upcoming task", () => {
    const lead = leadRecommendation([task({ title: "Board deck", priority: "high", due_date: "2026-08-20" })], [], TODAY);
    expect(lead?.text).toContain("get ahead on Board deck");
  });

  it("does not suggest getting ahead on a low-priority upcoming task", () => {
    const lead = leadRecommendation([task({ title: "Tidy notes", priority: "low", due_date: "2026-08-20" })], [], TODAY);
    expect(lead?.text).toContain("Next up is Tidy notes");
  });

  it("falls back to the goal furthest behind when no deadlines press", () => {
    const goals: DigestGoal[] = [
      { title: "Read 12 books", current: 9, target: 12 },
      { title: "Run 100km", current: 10, target: 100 },
    ];
    const lead = leadRecommendation([], goals, TODAY);
    expect(lead?.text).toContain("Run 100km");
    expect(lead?.text).toContain("10% of target");
  });

  it("ignores goals that are already more than half done", () => {
    expect(leadRecommendation([], [{ title: "Nearly there", current: 9, target: 10 }], TODAY)).toBeNull();
  });

  it("ignores goals with no target rather than dividing by zero", () => {
    const lead = leadRecommendation([], [{ title: "Untargeted", current: 0, target: 0 }], TODAY);
    expect(lead).toBeNull();
  });

  it("escapes the task title in the html form but not the text form", () => {
    const lead = leadRecommendation([task({ title: "Fix <script> bug", due_date: "2026-08-10" })], [], TODAY);
    expect(lead?.html).toContain("Fix &lt;script&gt; bug");
    expect(lead?.text).toContain("Fix <script> bug");
  });

  it("bolds the subject in the html form", () => {
    const lead = leadRecommendation([task({ title: "Ship it", due_date: TODAY })], [], TODAY);
    expect(lead?.html).toContain("<b>Ship it</b>");
  });

  it("treats an unknown priority as medium", () => {
    const lead = leadRecommendation(
      [
        task({ title: "Unknown", priority: "wat", due_date: "2026-08-10" }),
        task({ title: "Low", priority: "low", due_date: "2026-08-10" }),
      ],
      [],
      TODAY,
    );
    expect(lead?.text).toContain("Unknown");
  });
});

describe("escapeHtml", () => {
  it("escapes every character that could break out of markup", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
});
