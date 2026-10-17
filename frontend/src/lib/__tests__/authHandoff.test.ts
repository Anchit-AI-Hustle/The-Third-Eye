import { describe, expect, it } from "vitest";
import { approveHandoff, claimHandoff, codeHash, HANDOFF_TTL_MS, startHandoff, validCode } from "@/lib/authHandoff";

type Row = Record<string, any>;
function fakeDb() {
  const rows: Row[] = [];
  function from() {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const q: any = {
      insert: async (r: Row) => { rows.push({ ...r }); return { error: null }; },
      update: (p: Row) => { patch = p; return q; },
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      not: (c: string, _op: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; },
      gt: (c: string, v: string) => { filters.push((r) => r[c] > v); return q; },
      then: (res: (v: unknown) => unknown) => {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (patch) for (const r of hit) Object.assign(r, patch);
        return res({ data: hit.map((r) => ({ ...r })), error: null });
      },
    };
    return q;
  }
  return { rows, db: { from } as any };
}

const code = "a".repeat(64);

describe("app sign-in handoff", () => {
  it("only accepts long random codes", () => {
    expect(validCode(code)).toBe(true);
    expect(validCode("short")).toBe(false);
    expect(validCode("z".repeat(64))).toBe(false);
  });

  it("stores only a hash of the code", async () => {
    const { rows, db } = fakeDb();
    await startHandoff(db, code);
    expect(rows[0].id).toBe(codeHash(code));
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it("hands the approved account to the app once, then never again", async () => {
    const { db } = fakeDb();
    await startHandoff(db, code);
    expect(await claimHandoff(db, code)).toBeNull();
    expect(await approveHandoff(db, code, "a@x.test")).toBe(true);
    expect(await claimHandoff(db, code)).toBe("a@x.test");
    expect(await claimHandoff(db, code)).toBeNull();
  });

  it("cannot be approved twice or after it expires", async () => {
    const { rows, db } = fakeDb();
    await startHandoff(db, code);
    expect(await approveHandoff(db, code, "a@x.test")).toBe(true);
    expect(await approveHandoff(db, code, "b@x.test")).toBe(false);
    const other = "b".repeat(64);
    await startHandoff(db, other);
    rows[1].created_at = new Date(Date.now() - HANDOFF_TTL_MS - 1000).toISOString();
    expect(await approveHandoff(db, other, "a@x.test")).toBe(false);
  });

  it("ignores codes that were never started", async () => {
    const { db } = fakeDb();
    expect(await approveHandoff(db, code, "a@x.test")).toBe(false);
    expect(await claimHandoff(db, code)).toBeNull();
  });
});
