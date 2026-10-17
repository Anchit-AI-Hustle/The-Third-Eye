import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "me@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let returning = false;
  const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
  const q: Record<string, unknown> = {
    select: () => { returning = true; return q; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
    update: (p: Row) => { patch = p; return q; },
    insert: async (r: Row) => { (tables[table] ??= []).push(r); return { data: null, error: null }; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => {
      const hit = rows();
      if (patch) for (const r of hit) Object.assign(r, patch);
      return res({ data: returning ? hit : null, error: null });
    },
  };
  return q;
}
vi.mock("@/lib/db", () => ({ getDb: () => ({ from }) }));

import { POST } from "@/app/api/tasks/autopilot/route";

const call = async (body: unknown) => (await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify(body) }))).json();
const task = () => tables.tasks.find((t) => t.id === "t1")!;

beforeEach(() => {
  tables = { tasks: [{ id: "t1", user_id: "me@x.com", title: "Plan trip", status: "todo", all_updates: "" }, { id: "t9", user_id: "other@x.com", title: "Theirs", status: "todo" }], knowledge_docs: [] };
});

describe("/api/tasks/autopilot", () => {
  it("lets only one tab claim a task", async () => {
    expect(await call({ taskId: "t1", action: "claim" })).toMatchObject({ claimed: true, task: { title: "Plan trip" } });
    expect(await call({ taskId: "t1", action: "claim" })).toEqual({ claimed: false });
  });

  it("marks a claim of a run left stuck by a closed tab as a retry", async () => {
    Object.assign(task(), { autopilot_status: "running", autopilot_at: new Date(Date.now() - 30 * 60_000).toISOString() });
    expect(await call({ taskId: "t1", action: "claim" })).toMatchObject({ claimed: true, task: { retry: true } });
  });

  it("never touches another user's task", async () => {
    expect(await call({ taskId: "t9", action: "claim" })).toEqual({ error: "Task not found" });
  });

  it("marks a fully verified run done, with the report on the task", async () => {
    await call({ taskId: "t1", action: "claim" });
    const out = await call({ taskId: "t1", action: "finish", run: { text: "Itinerary saved.", checklist: [{ id: 1, title: "Write itinerary", verify: "", needsTool: true, status: "done", evidence: "Goa.html saved" }], confirms: [], stopReason: "end_turn" }, effects: [] });
    expect(out.status).toBe("done");
    expect(task()).toMatchObject({ status: "done", autopilot_status: "done" });
    expect(String(task().autopilot_report)).toContain("Goa.html saved");
    expect(String(task().all_updates)).toMatch(/Done by JARVIS/);
  });

  it("keeps a task open, marked needs you, when something waits for approval", async () => {
    await call({ taskId: "t1", action: "claim" });
    await call({ taskId: "t1", action: "finish", run: { text: "", checklist: [], confirms: [{ summary: "Send email" }] }, effects: [] });
    expect(task()).toMatchObject({ status: "in_progress", autopilot_status: "needs_you" });
  });

  it("saves what it made, tags its follow-ups, and ignores edits to its own task", async () => {
    await call({ taskId: "t1", action: "claim" });
    await call({ taskId: "t1", action: "finish", run: { text: "", checklist: [], confirms: [] }, effects: [
      { type: "file", data: { filename: "Goa.html", mime: "text/html", content: "<h1>Goa</h1>" } },
      { type: "task_create", data: { title: "Book flights" } },
      { type: "task_update", data: { id: "t1", patch: { status: "done" } } },
    ] });
    expect(tables.knowledge_docs[0]).toMatchObject({ user_id: "me@x.com", title: "Goa.html", content: "<h1>Goa</h1>" });
    expect(tables.tasks.find((t) => t.title === "Book flights")).toMatchObject({ user_id: "me@x.com", source_type: "Autopilot" });
    expect(task().status).toBe("in_progress");
  });
});
