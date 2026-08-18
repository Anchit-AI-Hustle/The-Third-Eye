import { describe, expect, it } from "vitest";

import { resolveTask, type MatchableTask } from "@/lib/tools/taskMatch";

// "Mark the gym task done" used to be answered with "update queued" and no
// update: the model had no id, guessed one, and the client applied a patch to
// a task that did not exist. Nothing may be reported as changed unless one
// specific task was actually found.

const tasks: MatchableTask[] = [
  { id: "u-1", title: "Renew gym membership", status: "todo" },
  { id: "u-2", title: "Draft Q3 launch plan", status: "in_progress" },
  { id: "u-3", title: "Renew gym membership", status: "done" },
  { id: "u-4", title: "Call the dentist", status: "todo" },
];

describe("by id", () => {
  it("finds the task", () => {
    expect(resolveTask(tasks, { id: "u-2" }).task?.title).toBe("Draft Q3 launch plan");
  });

  it("refuses an id that does not exist rather than queueing a write", () => {
    const r = resolveTask(tasks, { id: "made-up" });
    expect(r.task).toBeUndefined();
    expect(r.message).toMatch(/do not tell the user it was changed/i);
  });

  it("falls back to the title when the id was invented but the title is real", () => {
    expect(resolveTask(tasks, { id: "made-up", title: "Call the dentist" }).task?.id).toBe("u-4");
  });
});

describe("by title", () => {
  it("matches the exact title", () => {
    expect(resolveTask(tasks, { title: "Call the dentist" }).task?.id).toBe("u-4");
  });

  it("ignores case and punctuation", () => {
    expect(resolveTask(tasks, { title: "call the dentist!" }).task?.id).toBe("u-4");
  });

  it("matches on the words the user actually said", () => {
    expect(resolveTask(tasks, { title: "dentist" }).task?.id).toBe("u-4");
  });

  it("matches when the model pads the title out", () => {
    expect(resolveTask(tasks, { title: "the Call the dentist task" }).task?.id).toBe("u-4");
  });

  it("prefers the open task over the finished one with the same name", () => {
    // "Mark the gym one done" means the one still outstanding.
    expect(resolveTask(tasks, { title: "Renew gym membership" }).task?.id).toBe("u-1");
  });

  it("still reaches a closed task when it is the only match", () => {
    const closedOnly: MatchableTask[] = [{ id: "c-1", title: "Ship the deck", status: "done" }];
    expect(resolveTask(closedOnly, { title: "Ship the deck" }).task?.id).toBe("c-1");
  });
});

describe("refusing to guess", () => {
  it("asks which one when the words match several", () => {
    const many: MatchableTask[] = [
      { id: "a", title: "Email Priya about pricing", status: "todo" },
      { id: "b", title: "Email Priya about the contract", status: "todo" },
    ];
    const r = resolveTask(many, { title: "Email Priya" });
    expect(r.task).toBeUndefined();
    expect(r.message).toMatch(/nothing was changed/i);
    expect(r.message).toContain("Email Priya about pricing");
    expect(r.message).toContain("Email Priya about the contract");
  });

  it("says so plainly when nothing matches", () => {
    const r = resolveTask(tasks, { title: "buy a yacht" });
    expect(r.task).toBeUndefined();
    expect(r.message).toMatch(/do not claim it was updated or deleted/i);
  });

  it("asks the user when neither an id nor a title was given", () => {
    const r = resolveTask(tasks, {});
    expect(r.task).toBeUndefined();
    expect(r.message).toMatch(/ask the user which task/i);
  });

  it("finds nothing in an empty tracker instead of matching everything", () => {
    expect(resolveTask([], { title: "anything" }).task).toBeUndefined();
  });
});
