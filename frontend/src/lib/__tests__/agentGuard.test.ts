import { beforeEach, describe, expect, it, vi } from "vitest";

import { isAgentKilled, logAgentAction, recentAgentLog, setAgentKilled } from "@/lib/agentGuard";

let control: { killed: boolean } | null = null;
let auditRows: Array<Record<string, unknown>> = [];
const inserted: Array<Record<string, unknown>> = [];
const upserted: Array<Record<string, unknown>> = [];
let supabaseConfigured = true;
let insertThrows = false;

const sb = {
  from(table: string) {
    return {
      select() {
        return {
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: control }),
            order: () => ({ limit: () => Promise.resolve({ data: auditRows }) }),
          }),
        };
      },
      upsert(row: Record<string, unknown>) {
        upserted.push({ table, ...row });
        return Promise.resolve({ error: null });
      },
      insert(row: Record<string, unknown>) {
        if (insertThrows) return Promise.reject(new Error("audit table missing"));
        inserted.push(row);
        return Promise.resolve({ error: null });
      },
    };
  },
};

vi.mock("@/lib/serverSupabase", () => ({
  getAdminSupabase: () => (supabaseConfigured ? sb : null),
}));

beforeEach(() => {
  control = null;
  auditRows = [];
  inserted.length = 0;
  upserted.length = 0;
  supabaseConfigured = true;
  insertThrows = false;
});

describe("the kill switch", () => {
  it("is off when the user has never touched it", async () => {
    expect(await isAgentKilled("user@example.com")).toBe(false);
  });

  it("reports the agent stopped once engaged", async () => {
    control = { killed: true };
    expect(await isAgentKilled("user@example.com")).toBe(true);
  });

  it("reports the agent running once released", async () => {
    control = { killed: false };
    expect(await isAgentKilled("user@example.com")).toBe(false);
  });

  it("does not strand the user with a stopped agent when the database is unreachable", async () => {
    // Failing closed here would mean an outage silently disables the assistant
    // with no way to turn it back on. The switch is a user control, not a
    // security boundary — authorisation is enforced separately.
    supabaseConfigured = false;
    expect(await isAgentKilled("user@example.com")).toBe(false);
  });

  it("persists the switch against the user, not globally", async () => {
    await setAgentKilled("user@example.com", true);
    expect(upserted[0]).toMatchObject({ table: "agent_control", user_id: "user@example.com", killed: true });
  });
});

describe("the audit trail", () => {
  it("records what happened and who asked", async () => {
    await logAgentAction("user@example.com", { type: "task_create", label: "Created task", outcome: "applied" }, "gateway");
    expect(inserted[0]).toMatchObject({
      user_id: "user@example.com",
      type: "task_create",
      label: "Created task",
      outcome: "applied",
      source: "gateway",
    });
  });

  it("attributes to the browser by default", async () => {
    await logAgentAction("user@example.com", { type: "note_create", label: "Created note", outcome: "applied" });
    expect(inserted[0]).toMatchObject({ source: "browser" });
  });

  it("records blocked attempts, not just successful ones", async () => {
    await logAgentAction("user@example.com", { type: "chat", label: "Message refused", outcome: "blocked" }, "gateway");
    expect(inserted[0]).toMatchObject({ outcome: "blocked" });
  });

  it("never lets a failed audit write take the user's action down with it", async () => {
    // A dropped row shows up as a gap in the history. A thrown error would turn
    // a working request into a 500.
    insertThrows = true;
    await expect(
      logAgentAction("user@example.com", { type: "task_create", label: "Created task", outcome: "applied" }),
    ).resolves.toBeUndefined();
  });

  it("is a no-op rather than an error with no database", async () => {
    supabaseConfigured = false;
    await expect(logAgentAction("user@example.com", { type: "x", label: "y", outcome: "applied" })).resolves.toBeUndefined();
    expect(inserted).toEqual([]);
  });

  it("reads back the user's own history", async () => {
    auditRows = [{ id: "1", ts: "2026-01-01", type: "task_create", label: "Created task", outcome: "applied", source: "browser" }];
    const log = await recentAgentLog("user@example.com");
    expect(log).toHaveLength(1);
  });

  it("returns nothing rather than throwing when storage is unavailable", async () => {
    supabaseConfigured = false;
    expect(await recentAgentLog("user@example.com")).toEqual([]);
  });
});
