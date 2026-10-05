import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the query adapter against a real Postgres that `scripts/migrate.mjs` has
// been applied to: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
const url = process.env.TEST_DATABASE_URL;
const U = `db-test-${Date.now()}@example.com`;

describe.skipIf(!url)("db adapter against Postgres", () => {
  let db: NonNullable<ReturnType<typeof import("@/lib/db").getDb>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@/lib/db")).getDb()!;
  });
  afterAll(async () => {
    for (const t of ["tasks", "reminders", "conversation_sources", "expenses", "cortex_memories", "cortex_doc_chunks", "knowledge_docs", "usage_counters", "auth_rate_limit", "lifelog_days"]) {
      await db.from(t).delete().eq(t === "auth_rate_limit" ? "k" : "user_id", U);
    }
  });

  it("inserts with defaults and returns rows shaped like PostgREST's", async () => {
    const { data, error } = await db
      .from("tasks")
      .insert([{ id: `${U}-1`, user_id: U, title: "a", tags: ["x", "y"] }, { id: `${U}-2`, user_id: U, title: "b", workspace: "office" }])
      .select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0]).toMatchObject({ status: "todo", tags: ["x", "y"] });
    expect(data![0].created_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
  });

  it("filters, orders, limits and counts", async () => {
    await db.from("tasks").insert({ id: `${U}-3`, user_id: U, title: "c", status: "done" });
    const open = await db.from("tasks").select("id, title").eq("user_id", U).not("status", "in", "(done,cancelled)").order("title", { ascending: false });
    expect(open.data!.map((r) => r.title)).toEqual(["b", "a"]);
    const ws = await db.from("tasks").select("id").eq("user_id", U).is("spoc", null).or("workspace.is.null,workspace.eq.office");
    expect(ws.data).toHaveLength(3);
    const some = await db.from("tasks").select("id").eq("user_id", U).in("id", [`${U}-1`, `${U}-3`]).limit(1);
    expect(some.data).toHaveLength(1);
    const c = await db.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", U);
    expect(c).toMatchObject({ data: null, error: null, count: 3 });
  });

  it("single / maybeSingle", async () => {
    expect((await db.from("tasks").select("title").eq("id", `${U}-1`).single()).data).toEqual({ title: "a" });
    expect((await db.from("tasks").select("title").eq("id", "nope").maybeSingle())).toMatchObject({ data: null, error: null });
    expect((await db.from("tasks").select("title").eq("user_id", U).maybeSingle()).error?.code).toBe("PGRST116");
  });

  it("updates and deletes only what the filters match", async () => {
    await db.from("tasks").update({ title: "A", description: undefined }).eq("id", `${U}-1`).eq("user_id", U);
    await db.from("tasks").delete().eq("id", `${U}-2`).eq("user_id", U);
    const { data } = await db.from("tasks").select("id, title").eq("user_id", U).order("id");
    expect(data).toEqual([{ id: `${U}-1`, title: "A" }, { id: `${U}-3`, title: "c" }]);
  });

  it("upserts on the conflict target, or skips duplicates", async () => {
    const row = { user_id: U, connector: "wa", conversation_id: "c1", label: "one" };
    await db.from("conversation_sources").upsert(row, { onConflict: "user_id,connector,conversation_id" });
    await db.from("conversation_sources").upsert({ ...row, label: "two" }, { onConflict: "user_id,connector,conversation_id" });
    await db.from("conversation_sources").upsert({ ...row, label: "three" }, { onConflict: "user_id,connector,conversation_id", ignoreDuplicates: true });
    const { data } = await db.from("conversation_sources").select("label").eq("user_id", U).order("label", { ascending: true, nullsFirst: false });
    expect(data).toEqual([{ label: "two" }]);
  });

  it("re-saves a Life Log day in place, jsonb arrays intact", async () => {
    const day = { user_id: U, id: "2026-09-29", date: "2026-09-29", segments: [{ id: "s1" }], events: [], diary: [] };
    await db.from("lifelog_days").upsert(day, { onConflict: "user_id,id" });
    const r = await db.from("lifelog_days").upsert({ ...day, summary: "done" }, { onConflict: "user_id,id" }).select("*");
    expect(r.error).toBeNull();
    const { data } = await db.from("lifelog_days").select("segments, events, summary").eq("user_id", U);
    expect(data).toEqual([{ segments: [{ id: "s1" }], events: [], summary: "done" }]);
  });

  it("returns numeric as numbers and timestamps within lte filters", async () => {
    await db.from("expenses").insert({ id: `${U}-e`, user_id: U, amount: 12.5, spent_on: "2026-09-29", gst_rate: 18 });
    const { data } = await db.from("expenses").select("amount, gst_rate").eq("user_id", U).single();
    expect(data).toEqual({ amount: 12.5, gst_rate: 18 });
    await db.from("reminders").insert({ user_id: U, title: "r", fire_at: new Date(Date.now() - 1000).toISOString() });
    const due = await db.from("reminders").select("id, fire_at").eq("user_id", U).lte("fire_at", new Date().toISOString());
    expect(due.data).toHaveLength(1);
  });

  it("stores vectors and calls set-returning and scalar functions", async () => {
    const vec = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
    const ins = await db.from("cortex_memories").insert({ user_id: U, content: "hello", embedding: vec });
    expect(ins.error).toBeNull();
    const m = await db.rpc("match_cortex_memories", { p_user_id: U, query_embedding: vec, match_count: 3 });
    expect(m.error).toBeNull();
    expect(m.data[0]).toMatchObject({ content: "hello" });
    expect(m.data[0].similarity).toBeCloseTo(1);
    expect((await db.from("knowledge_docs").insert({ id: `${U}-d`, user_id: U, title: "Doc" })).error).toBeNull();
    const chunk = { id: `${U}-c`, user_id: U, doc_id: `${U}-d`, doc_title: "Doc", chunk_index: 0, content: "chunk", embedding: vec };
    expect((await db.from("cortex_doc_chunks").insert(chunk)).error).toBeNull();
    const c = await db.rpc("match_cortex_chunks", { p_user_id: U, query_embedding: vec, match_count: 3 });
    expect(c.error).toBeNull();
    expect(c.data[0]).toMatchObject({ doc_title: "Doc", content: "chunk" });
    expect((await db.rpc("increment_usage", { p_user_id: U, p_metric: "chat", p_amount: 1 })).data).toBe(1);
    expect((await db.rpc("auth_rate_limit_hit", { p_bucket: "phone_number", p_key: U, p_window_secs: 600 })).data).toBe(1);
  });

  it("reports errors with Postgres codes instead of throwing", async () => {
    expect((await db.from("no_such_table").delete().eq("user_id", U)).error?.code).toBe("42P01");
    expect((await db.from("tasks").delete().eq("no_such_col", U)).error?.code).toBe("42703");
    expect((await db.from("tasks").update({ 'x"; drop table tasks; --': 1 }).eq("id", "z")).error?.code).toBe("42602");
    expect((await db.rpc("no_such_fn")).error?.code).toBe("42883");
  });
});
