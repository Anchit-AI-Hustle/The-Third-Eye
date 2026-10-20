import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { applyEffects } from "@/lib/nativeClient";

type Row = Record<string, any>;

// Enough of lib/db's builder to see what was written and for whom.
function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const from = (table: string) => {
    const where: [string, unknown][] = [];
    let op: { kind: "insert"; row: Row } | { kind: "update"; patch: Row } | { kind: "delete" } | { kind: "select" } = { kind: "select" };
    const matches = (r: Row) => where.every(([k, v]) => r[k] === v);
    const exec = () => {
      const rows = (tables[table] ??= []);
      if (op.kind === "insert") rows.push(op.row);
      if (op.kind === "update") for (const r of rows.filter(matches)) Object.assign(r, (op as { patch: Row }).patch);
      if (op.kind === "delete") tables[table] = rows.filter((r) => !matches(r));
      return { data: op.kind === "select" ? rows.filter(matches) : null, error: null };
    };
    const q: any = {
      insert: (row: Row) => { op = { kind: "insert", row }; return q; },
      update: (patch: Row) => { op = { kind: "update", patch }; return q; },
      delete: () => { op = { kind: "delete" }; return q; },
      select: () => q,
      eq: (k: string, v: unknown) => { where.push([k, v]); return q; },
      maybeSingle: async () => ({ data: exec().data?.[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res(exec()),
    };
    return q;
  };
  return { db: { from } as unknown as Db, tables };
}

describe("applyEffects for the native apps", () => {
  it("writes what the assistant created, always as the signed-in person", async () => {
    const { db, tables } = fakeDb();
    const out = await applyEffects(db, "me@x.com", [
      { type: "task_create", data: { title: "Renew passport", priority: "high", due_date: "2026-11-01" } },
      { type: "note_create", data: { title: "Packing", content: "charger" } },
      { type: "goal_create", data: { title: "Read 12 books", target: 12, unit: "books" } },
      { type: "expense_create", data: { amount: 250, category: "Food", spent_on: "2026-10-20" } },
      { type: "open_url", data: { url: "https://example.com" } },
    ]);
    expect(out).toEqual([
      { type: "task_create", ok: true }, { type: "note_create", ok: true }, { type: "goal_create", ok: true }, { type: "expense_create", ok: true },
    ]);
    expect(tables.tasks[0]).toMatchObject({ user_id: "me@x.com", title: "Renew passport", status: "todo", priority: "high", due_date: "2026-11-01" });
    expect(tables.notes[0]).toMatchObject({ user_id: "me@x.com", title: "Packing", content: "charger", pinned: false });
    expect(tables.goals[0]).toMatchObject({ user_id: "me@x.com", target: 12, current: 0, unit: "books" });
    expect(tables.expenses[0]).toMatchObject({ user_id: "me@x.com", amount: 250, category: "Food" });
    expect(tables.tasks[0]).not.toHaveProperty("assignee");
  });

  it("updates, moves goal progress and deletes only the person's own rows", async () => {
    const { db, tables } = fakeDb({
      tasks: [{ id: "t1", user_id: "me@x.com", status: "todo" }, { id: "t1", user_id: "other@x.com", status: "todo" }],
      goals: [{ id: "g1", user_id: "me@x.com", current: 3 }],
      notes: [{ id: "n1", user_id: "me@x.com" }, { id: "n1", user_id: "other@x.com" }],
    });
    await applyEffects(db, "me@x.com", [
      { type: "task_update", data: { id: "t1", patch: { status: "done", user_id: "attacker@x.com" } } },
      { type: "goal_update", data: { id: "g1", delta: 2 } },
      { type: "note_delete", data: { id: "n1" } },
    ]);
    expect(tables.tasks).toEqual([
      expect.objectContaining({ user_id: "me@x.com", status: "done" }),
      { id: "t1", user_id: "other@x.com", status: "todo" },
    ]);
    expect(tables.goals[0].current).toBe(5);
    expect(tables.notes).toEqual([{ id: "n1", user_id: "other@x.com" }]);
  });

  it("sets goal progress outright, and reports a goal it cannot find", async () => {
    const { db, tables } = fakeDb({ goals: [{ id: "g1", user_id: "me@x.com", current: 3 }] });
    const out = await applyEffects(db, "me@x.com", [
      { type: "goal_update", data: { id: "g1", set_to: 10 } },
      { type: "goal_update", data: { id: "nope", delta: 1 } },
    ]);
    expect(tables.goals[0].current).toBe(10);
    expect(out).toEqual([{ type: "goal_update", ok: true }, { type: "goal_update", ok: false }]);
  });

  it("skips effects with nothing to write", async () => {
    const { db, tables } = fakeDb();
    expect(await applyEffects(db, "me@x.com", [{ type: "task_create", data: {} }, { type: "expense_create", data: { amount: 0 } }])).toEqual([]);
    expect(tables).toEqual({});
  });
});
