import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Checks the migrated database against what the code actually asks of it: every
// table it reads or writes, every column it selects by name and every function
// it calls must exist, and the API roles Supabase hands the publishable key to
// must reach none of it. TEST_DATABASE_URL=postgres://… npm test; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;
const SCHEMAS = ["public", "kolab"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" ? [] : sources(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

const code = sources(join(__dirname, "..", "..")).map((f) => readFileSync(f, "utf8")).join("\n");
const names = (re: RegExp) => [...new Set([...code.matchAll(re)].map((m) => m[1]))].sort();
const tables = names(/\.from\(\s*"([a-z_]+)"/g);
const functions = names(/\.rpc\(\s*"([a-z_]+)"/g);
// `.from("t").select("a, b")` — the plain column names a query depends on.
const selected = [...code.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)\s*\.select\(\s*"([^"]*)"/g)].flatMap(([, t, cols]) =>
  cols.split(",").map((c) => c.trim().split(":").pop()!.split("::")[0].trim())
    .filter((c) => /^[a-z_]+$/.test(c)).map((c) => `${t}.${c}`),
);

describe.skipIf(!url)("database schema against the code", () => {
  const client = new pg.Client({ connectionString: url });
  const where = new Map<string, string>();
  beforeAll(async () => {
    await client.connect();
    const { rows } = await client.query(
      "select table_schema, table_name from information_schema.tables where table_schema = any($1)", [SCHEMAS],
    );
    for (const r of rows) if (!where.has(r.table_name) || r.table_schema === "public") where.set(r.table_name, r.table_schema);
  });
  afterAll(() => client.end());

  it("has every table the code queries, and each one answers a select", async () => {
    expect(tables.length).toBeGreaterThan(30);
    const missing = tables.filter((t) => !where.has(t));
    expect(missing).toEqual([]);
    for (const t of tables) await client.query(`select * from "${where.get(t)}"."${t}" limit 1`);
  });

  it("has every column the code selects by name", async () => {
    const { rows } = await client.query(
      "select table_name || '.' || column_name as c from information_schema.columns where table_schema = any($1)", [SCHEMAS],
    );
    const have = new Set(rows.map((r) => r.c));
    expect([...new Set(selected)].filter((c) => !have.has(c))).toEqual([]);
  });

  it("has every function the code calls", async () => {
    const { rows } = await client.query(
      "select distinct proname from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1)", [functions],
    );
    expect(functions.filter((f) => !rows.some((r) => r.proname === f))).toEqual([]);
  });

  it("gives the publishable-key roles nothing in the app's schemas, with RLS on every table", async () => {
    const grants = await client.query(
      "select table_schema || '.' || table_name as t from information_schema.role_table_grants where grantee in ('anon', 'authenticated') and table_schema = any($1)",
      [SCHEMAS],
    );
    expect(grants.rows.map((r) => r.t)).toEqual([]);
    const open = await client.query(
      "select c.oid::regclass::text as t from pg_class c where c.relnamespace::regnamespace::text = any($1) and c.relkind in ('r', 'p') and not c.relrowsecurity",
      [SCHEMAS],
    );
    expect(open.rows.map((r) => r.t)).toEqual([]);
  });
});
