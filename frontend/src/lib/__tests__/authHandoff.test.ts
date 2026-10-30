import { describe, expect, it, vi } from "vitest";
import { approveHandoff, browserKey, claimBrowserHandoff, claimHandoff, codeHash, confirmCode, HANDOFF_TTL_MS, startHandoff, validCode } from "@/lib/authHandoff";

vi.stubEnv("NEXTAUTH_SECRET", "s3cret");

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

  it("signs a browser-started code in only with the confirmation shown to the account that approved it", async () => {
    const { db } = fakeDb();
    await startHandoff(db, browserKey(code));
    expect(await approveHandoff(db, browserKey(code), "victim@x.test")).toBe(true);
    // Whoever started it knows the code, but not the confirmation for the victim's account.
    expect(confirmCode(code, "attacker@x.test")).not.toBe(confirmCode(code, "victim@x.test"));
    expect(await claimHandoff(db, code)).toBeNull();
    expect(await claimBrowserHandoff(db, code, confirmCode(code, "attacker@x.test"))).toBeNull();
    // One wrong confirmation burns it, so it can't be guessed.
    expect(await claimBrowserHandoff(db, code, confirmCode(code, "victim@x.test"))).toBeNull();
  });

  it("claims a browser-started code with the right confirmation, typed in any case", async () => {
    const { db } = fakeDb();
    await startHandoff(db, browserKey(code));
    await approveHandoff(db, browserKey(code), "a@x.test");
    expect(confirmCode(code, "a@x.test")).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(await claimBrowserHandoff(db, code, ` ${confirmCode(code, "a@x.test").toLowerCase()} `)).toBe("a@x.test");
  });
});
