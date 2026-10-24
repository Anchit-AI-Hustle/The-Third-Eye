// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "me@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

type Row = Record<string, unknown>;
let rows: Row[] = [];
let failUpdate = false;
let clock = 0;
let sameMillisecond = false;

// Enough of the db builder for this route: filters, update, insert().select().single(), delete.
function from() {
  const preds: ((r: Row) => boolean)[] = [];
  let op: { kind: "update"; patch: Row } | { kind: "delete" } | null = null;
  const match = () => rows.filter((r) => preds.every((p) => p(r)));
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => { preds.push((r) => r[k] === v); return q; },
    is: (k: string, v: unknown) => { preds.push((r) => (r[k] ?? null) === v); return q; },
    lt: (k: string, v: string) => { preds.push((r) => String(r[k]) < v); return q; },
    neq: (k: string, v: unknown) => { preds.push((r) => r[k] !== v); return q; },
    order: () => q,
    limit: () => q,
    update: (patch: Row) => { op = { kind: "update", patch }; return q; },
    delete: () => { op = { kind: "delete" }; return q; },
    insert: (r: Row) => {
      const row = { ...r, created_at: new Date(Date.UTC(2026, 9, 24, 0, 0, sameMillisecond ? 0 : clock++)).toISOString(), revoked_at: null };
      rows.push(row);
      return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
    },
    maybeSingle: async () => ({ data: match()[0] ?? null }),
    then: (ok: (v: unknown) => void) => {
      if (op?.kind === "update" && failUpdate) return ok({ error: { message: "db down" } });
      if (op?.kind === "update") match().forEach((r) => Object.assign(r, (op as { patch: Row }).patch));
      if (op?.kind === "delete") { const gone = new Set(match()); rows = rows.filter((r) => !gone.has(r)); }
      ok({ data: null, error: null });
    },
  };
  return q;
}
vi.mock("@/lib/db", () => ({ getDb: () => ({ from }) }));

import { DELETE, GET, POST } from "@/app/api/bridge/token/route";

const active = () => rows.filter((r) => r.revoked_at === null);

beforeEach(() => { rows = []; failUpdate = false; clock = 0; sameMillisecond = false; });

describe("OpenClaw token", () => {
  it("is shown once at creation and stored only as a hash", async () => {
    const { token } = await (await POST()).json();
    expect(token).toMatch(/^te_gw_/);
    expect(rows).toEqual([expect.objectContaining({ user_id: "me@x.com", name: "OpenClaw", scopes: ["chat"] })]);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(await (await GET()).json()).toMatchObject({ active: true });
  });

  it("leaves only the newest token active, even when two are made back to back", async () => {
    await Promise.all([POST(), POST()]);
    await POST();
    expect(active()).toHaveLength(1);
    expect(active()[0]?.created_at).toBe(rows.at(-1)?.created_at);
  });

  it("never leaves two active when two are minted in the same millisecond", async () => {
    sameMillisecond = true;
    await Promise.all([POST(), POST()]);
    expect(active().length).toBeLessThanOrEqual(1);
  });

  it("does not hand out a replacement when the old token could not be revoked", async () => {
    await POST();
    failUpdate = true;
    const res = await POST();
    expect(res.status).toBe(500);
    expect(rows).toHaveLength(1);
  });

  it("says so when revoking fails, and revokes when it works", async () => {
    await POST();
    failUpdate = true;
    expect((await DELETE()).status).toBe(500);
    failUpdate = false;
    expect((await DELETE()).status).toBe(200);
    expect(active()).toEqual([]);
  });
});
