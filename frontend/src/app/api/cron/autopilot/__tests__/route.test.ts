import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};

// Enough of lib/db's builder for the cron route: filters, insert, and conditional updates.
function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
  const apply = () => { const hit = rows(); if (patch) for (const r of hit) Object.assign(r, patch); return hit; };
  const q: any = {
    select: () => q,
    limit: () => q,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
    update: (p: Row) => { patch = p; return q; },
    insert: async (r: Row) => { tables[table].push({ ...r }); return { data: null, error: null }; },
    then: (res: (v: unknown) => unknown) => res({ data: apply(), error: null }),
  };
  return q;
}
vi.mock("@/lib/db", () => ({ getDb: () => ({ from }) }));
let llm = "ok";
vi.mock("@/lib/llmCascade", () => ({ llmStatus: async () => ({ status: llm, providers: {} }) }));
vi.mock("@/lib/whatsapp", () => ({ applySideEffects: vi.fn(async () => undefined) }));

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}`).join("\n\n");
const { GET } = await import("@/app/api/cron/autopilot/route");
const call = (auth = "Bearer s3cret") => GET(new Request("https://x.test/api/cron/autopilot", { headers: { authorization: auth } }) as never);

beforeEach(() => {
  llm = "ok";
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("NEXTAUTH_URL", "https://app.test");
  tables = {
    gateway_tokens: [],
    knowledge_docs: [],
    tasks: [
      { user_id: "a@x.test", id: "t-low", title: "Tidy desk", priority: "low", status: "todo", autopilot_status: null },
      { user_id: "a@x.test", id: "t-urgent", title: "Draft the board update", priority: "urgent", due_date: "2026-10-01", status: "todo", autopilot_status: null },
      { user_id: "b@x.test", id: "t-needs", title: "Sign lease", priority: "urgent", status: "in_progress", autopilot_status: "needs_you" },
    ],
  };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/cron/autopilot", () => {
  it("refuses a caller without the cron secret", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
  });

  it("works open tasks as their owner with a single-use chat token, and records the outcome", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      const live = tables.gateway_tokens.some((t) => !t.revoked_at && auth.startsWith("Bearer te_gw_"));
      expect(live).toBe(true);
      return new Response(sse([
        ["text", { text: "Drafted it and saved it to Knowledge." }],
        ["done", { sideEffects: [], checklist: [{ id: "1", title: "Draft", status: "done", evidence: "saved" }] }],
      ]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const body = await (await call()).json();
    expect(body.worked.map((w: Row) => w.id)).toEqual(["t-urgent", "t-low"]);
    expect(fetchMock).toHaveBeenCalledWith("https://app.test/api/chat", expect.anything());
    const urgent = tables.tasks.find((t) => t.id === "t-urgent")!;
    expect(urgent).toMatchObject({ status: "done", autopilot_status: "done" });
    expect(urgent.all_updates).toMatch(/Done by JARVIS/);
    expect(tables.tasks.find((t) => t.id === "t-needs")!.autopilot_status).toBe("needs_you");
    expect(tables.gateway_tokens).toHaveLength(2);
    expect(tables.gateway_tokens.every((t) => t.revoked_at && t.scopes.join() === "chat" && !("token" in t))).toBe(true);
  });

  it("marks a run that could not reach the assistant as failed, not done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "All providers busy" }), { status: 503 })));
    await call();
    const urgent = tables.tasks.find((t) => t.id === "t-urgent")!;
    expect(urgent).toMatchObject({ status: "todo", autopilot_status: "failed" });
    expect(urgent.all_updates).toMatch(/couldn't work on it/);
  });

  it("waits without touching a task while every AI provider is out", async () => {
    llm = "down";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await call()).json();
    expect(body).toMatchObject({ worked: [], waiting: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tables.tasks.find((t) => t.id === "t-urgent")!.autopilot_status).toBeNull();
  });

  it("stops the batch loop when a run hits a provider outage, and leaves the task due", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sse([["text", { text: "Live actions are unavailable." }], ["done", { stop_reason: "fallback", sideEffects: [] }]]))));
    const body = await (await call()).json();
    expect(body.waiting).toEqual(expect.any(String));
    const urgent = tables.tasks.find((t) => t.id === "t-urgent")!;
    expect(urgent).toMatchObject({ status: "todo", autopilot_status: "failed" });
    expect(urgent.all_updates).toMatch(/waiting for a free AI provider/);
    expect(urgent.all_updates).not.toMatch(/couldn't work on it/);
  });
});
