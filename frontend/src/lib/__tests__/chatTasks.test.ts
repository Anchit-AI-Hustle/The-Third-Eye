import { beforeEach, describe, expect, it, vi } from "vitest";

const cascade = vi.fn();
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (o: unknown) => cascade(o) }));
const followUps = vi.fn(async (_ctx: unknown, tasks: unknown[]) => ({ inserted: tasks.length, merged: 0, skipped: 0 }));
vi.mock("@/lib/tasks", async (orig) => ({
  ...(await orig<typeof import("@/lib/tasks")>()),
  saveExtractedTasks: (c: unknown, t: unknown[]) => followUps(c, t),
}));
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn(async () => {}) }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

// Enough of lib/db's query builder for the sync: filters, one-row reads,
// updates and inserts against in-memory tables.
function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
  const q: Record<string, unknown> = {
    select: () => q, order: () => q, limit: () => q,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
    gt: (c: string, v: string) => { filters.push((r) => String(r[c]) > v); return q; },
    update: (p: Row) => { patch = p; return q; },
    insert: async (r: Row) => { tables[table].push(r); return { data: null, error: null }; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => {
      if (patch) for (const r of rows()) Object.assign(r, patch);
      return res({ data: rows(), error: null });
    },
  };
  return q;
}
vi.mock("@/lib/db", () => ({ getDb: () => ({ from }) }));

import { syncChatTasks, syncStaleChats } from "@/lib/chatTasks";

const U = "u@x.com";
const msgs = (...pairs: string[]) => pairs.map((content, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user", content }));
const reply = (o: unknown) => cascade.mockResolvedValueOnce({ text: JSON.stringify(o) });
const chatTask = () => tables.tasks.filter((t) => t.source_type === "Assistant" && t.source_ref_id === "c1");

beforeEach(() => {
  cascade.mockReset();
  followUps.mockClear();
  tables = {
    conversations: [{ user_id: U, id: "c1", title: "Yoga site", messages: msgs("Build me a yoga landing page and save it", "Saved index.html to your Downloads."), tasks_synced_n: 0, updated_at: new Date().toISOString() }],
    tasks: [{ id: "t1", user_id: U, title: "Launch yoga studio website", status: "todo", workspace: "personal", spoc: null, all_updates: "" }],
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("assistant chats sync to the Task Tracker", () => {
  it("makes one task for a chat that did real work, linked back to the chat, with the status the chat reached", async () => {
    reply({ chat_task: { task_id: null, heading: "Build yoga landing page", description: "index.html made and saved", status: "done", urgency: "Medium", workspace: "personal", update: "Page built and saved" }, task_updates: [], follow_ups: [] });
    const r = await syncChatTasks(U, "c1");
    expect(r).toMatchObject({ created: 1, updated: 0 });
    expect(chatTask()).toHaveLength(1);
    expect(chatTask()[0]).toMatchObject({ title: "Build yoga landing page", status: "done", workspace: "personal", source_link: "/assistant?chat=c1" });
    expect(tables.conversations[0].tasks_synced_n).toBe(2);
  });

  it("skips small talk and quick questions, and does not read them again", async () => {
    reply({ chat_task: null, task_updates: [], follow_ups: [] });
    const r = await syncChatTasks(U, "c1");
    expect(r).toMatchObject({ created: 0, updated: 0 });
    expect(chatTask()).toHaveLength(0);
    expect(tables.conversations[0].tasks_synced_n).toBe(2);
    expect(await syncChatTasks(U, "c1")).toMatchObject({ skipped: "nothing new" });
    expect(cascade).toHaveBeenCalledTimes(1);
  });

  it("updates the chat's own task when the chat continues, instead of adding another", async () => {
    reply({ chat_task: { task_id: null, heading: "Build yoga landing page", status: "in_progress", update: "First draft" }, task_updates: [], follow_ups: [] });
    await syncChatTasks(U, "c1");
    tables.conversations[0].messages = msgs("Build me a yoga landing page and save it", "Draft ready.", "Add a pricing section", "Added and saved.");
    reply({ chat_task: { task_id: null, heading: "Build yoga landing page", status: "done", update: "Pricing added, page finished" }, task_updates: [], follow_ups: [] });
    const r = await syncChatTasks(U, "c1");
    expect(r).toMatchObject({ created: 0, updated: 1 });
    expect(chatTask()).toHaveLength(1);
    expect(chatTask()[0].status).toBe("done");
    expect(String(chatTask()[0].all_updates)).toMatch(/Pricing added/);
    expect(cascade.mock.calls[1][0].messages[0].content).toMatch(/THIS CHAT'S TASK/);
  });

  it("files the chat under a matching open task rather than duplicating it", async () => {
    reply({ chat_task: { task_id: "t1", heading: "Launch yoga studio website", status: "in_progress", update: "Landing page built in chat" }, task_updates: [], follow_ups: [] });
    const r = await syncChatTasks(U, "c1");
    expect(r).toMatchObject({ created: 0, updated: 1 });
    expect(chatTask()).toHaveLength(0);
    expect(tables.tasks[0]).toMatchObject({ status: "in_progress" });
    expect(String(tables.tasks[0].all_updates)).toMatch(/Landing page built in chat/);
  });

  it("adds follow-ups the user still has to do as their own tasks", async () => {
    reply({ chat_task: null, task_updates: [], follow_ups: [{ task_heading: "Buy a domain for the yoga site", workspace: "personal", urgency: "High" }] });
    const r = await syncChatTasks(U, "c1");
    expect(r.created).toBe(1);
    expect(followUps).toHaveBeenCalledWith(
      expect.objectContaining({ userId: U, sourceType: "Assistant", sourceLink: "/assistant?chat=c1" }),
      [expect.objectContaining({ taskHeading: "Buy a domain for the yoga site", workspace: "personal" })],
    );
  });

  it("ignores task ids the model made up", async () => {
    reply({ chat_task: null, task_updates: [{ task_id: "nope", update: "x", status: "done" }], follow_ups: [] });
    expect(await syncChatTasks(U, "c1")).toMatchObject({ updated: 0 });
  });

  it("keeps the chat unread when the model is unavailable, so the next sync tries again", async () => {
    cascade.mockRejectedValueOnce(new Error("all providers busy"));
    const r = await syncChatTasks(U, "c1");
    expect(r.skipped).toMatch(/extraction failed/);
    expect(tables.conversations[0].tasks_synced_n).toBe(0);
  });

  it("does nothing for another user's chat id", async () => {
    expect(await syncChatTasks("other@x.com", "c1")).toMatchObject({ skipped: "no chat" });
    expect(cascade).not.toHaveBeenCalled();
  });

  it("catches up chats the browser never synced, once", async () => {
    reply({ chat_task: null, task_updates: [], follow_ups: [] });
    const db = { from } as unknown as Parameters<typeof syncStaleChats>[0];
    expect(await syncStaleChats(db)).toEqual({ checked: 1, synced: 1 });
    expect(tables.conversations[0].tasks_synced_at).toBeTruthy();
    expect(await syncStaleChats(db)).toEqual({ checked: 0, synced: 0 });
  });
});
