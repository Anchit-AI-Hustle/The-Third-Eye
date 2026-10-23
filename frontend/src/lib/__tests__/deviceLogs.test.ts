import { beforeEach, describe, expect, it, vi } from "vitest";

const cascade = vi.fn();
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (o: unknown) => cascade(o) }));
const saved = vi.fn(async (_ctx: unknown, tasks: unknown[]) => ({ inserted: tasks.length, merged: 0, skipped: 0 }));
vi.mock("@/lib/tasks", () => ({ saveExtractedTasks: (c: unknown, t: unknown[]) => saved(c, t) }));
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn(async () => {}) }));

const LOGS = [1, 2, 3].map((i) => ({ id: `l${i}`, device: "mac", title: `Ads manager ${i}`, url: null, detail: null, duration_s: 600, started_at: "2026-10-12T10:00:00Z" }));
const TASKS = [{ id: "t1", title: "Fix Meta CAC", status: "todo", workspace: "office", spoc: null }];
let writes: { table: string; op: string; arg: unknown }[] = [];

function chain(table: string, data: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: { all_updates: "" } });
  q.update = (arg: unknown) => { writes.push({ table, op: "update", arg }); return q; };
  q.then = (r: (v: unknown) => unknown) => r({ data, error: null });
  return q;
}
vi.mock("@/lib/db", () => ({ getDb: () => ({ from: (t: string) => chain(t, t === "device_logs" ? LOGS : TASKS) }) }));

import { summarizeDeviceLogs } from "@/lib/deviceLogs";

beforeEach(() => { cascade.mockReset(); saved.mockClear(); writes = []; vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });

const processed = () => writes.some((w) => w.table === "device_logs" && (w.arg as { processed?: boolean }).processed);

describe("AI Log Sync with malformed model output", () => {
  it("asks for JSON mode with room for a full answer", async () => {
    cascade.mockResolvedValue({ text: '{"summary":"s","task_updates":[],"new_tasks":[]}' });
    await summarizeDeviceLogs("u@x.com");
    expect(cascade.mock.calls[0][0]).toMatchObject({ jsonMode: true });
    expect(cascade.mock.calls[0][0].system).not.toMatch(/Anchit/);
    expect(cascade.mock.calls[0][0].maxTokens).toBeGreaterThanOrEqual(3000);
  });

  it("applies what survived a truncated answer and reports it as partial", async () => {
    cascade.mockResolvedValue({ text: '{"summary":"Worked on Meta ads","task_updates":[{"task_id":"t1","update":"Cut CAC 10%","status":"in_progress"}],"new_tasks":[{"task_heading":"Review Google ads","workspace":"office"},{"task_heading":"Pay the elec' });
    const r = await summarizeDeviceLogs("u@x.com");
    expect(r).toMatchObject({ processed: 3, updated: 1, inserted: 1, summary: "Worked on Meta ads" });
    expect(r.partial).toMatch(/repaired/);
    expect(processed()).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/log sync partial/), expect.anything());
  });

  it("skips invalid items instead of failing the batch", async () => {
    cascade.mockResolvedValue({ text: '{"summary":"s","task_updates":[{"task_id":"t1"},{"task_id":"t1","update":"ok"}],"new_tasks":[{"workspace":"office"}]}' });
    const r = await summarizeDeviceLogs("u@x.com");
    expect(r).toMatchObject({ updated: 1, inserted: 0 });
    expect(r.partial).toMatch(/2 invalid item/);
  });

  it("leaves the logs unprocessed when nothing can be read, with the reason", async () => {
    cascade.mockResolvedValue({ text: "I could not find anything." });
    const r = await summarizeDeviceLogs("u@x.com");
    expect(r).toMatchObject({ processed: 0, skipped: expect.stringMatching(/no JSON object/) });
    expect(processed()).toBe(false);
  });
});
