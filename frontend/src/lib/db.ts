import { Pool, types, type PoolClient } from "pg";

// Server-only Postgres (Neon) access behind the query-builder surface the app
// was written against: `db.from(t).select(...).eq(...)` and `db.rpc(fn, args)`,
// resolving to `{ data, error, count }` and never throwing. The connection is
// the table owner, so RLS policies do not apply here — every caller constrains
// by user_id itself, exactly as it did with the service-role key.

type Row = Record<string, unknown>;
export type DbError = { message: string; code: string; details?: string; hint?: string };
// Untyped rows, as the supabase-js client this replaces returned: lists are
// any[], single rows and rpc values are any.
export type DbResult<D = any> = { data: D | null; error: DbError | null; count: number | null };

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name: string): string {
  const n = name.trim();
  if (!IDENT.test(n)) throw Object.assign(new Error(`invalid identifier: ${name}`), { code: "42602" });
  return `"${n}"`;
}

// Rows come back shaped as PostgREST returned them: numbers for numeric/bigint,
// ISO strings for timestamps, plain "YYYY-MM-DD" for dates.
const parseTimestamptz = types.getTypeParser(1184);
function getTypeParser(oid: number, format?: "text" | "binary") {
  switch (oid) {
    case 20:
    case 1700:
      return (v: string) => Number(v);
    case 1082:
      return (v: string) => v;
    case 1114:
      return (v: string) => v.replace(" ", "T");
    case 1184:
      return (v: string) => {
        const d = parseTimestamptz(v) as Date;
        return Number.isFinite(d.getTime()) ? d.toISOString() : v;
      };
    default:
      return types.getTypeParser(oid, format);
  }
}

let _pool: Pool | null = null;
function pool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_pool) _pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, types: { getTypeParser } });
  return _pool;
}

// Column udt names per table, so values bound for json/jsonb/vector columns are
// serialised as JSON rather than as Postgres array literals.
const columnTypes = new Map<string, Promise<Map<string, string>>>();
function typesOf(c: PoolClient | Pool, schema: string, table: string): Promise<Map<string, string>> {
  const key = `${schema}.${table}`;
  let p = columnTypes.get(key);
  if (!p) {
    p = c
      .query<{ column_name: string; udt_name: string }>(
        "select column_name, udt_name from information_schema.columns where table_schema = $1 and table_name = $2",
        [schema, table],
      )
      .then((r) => new Map(r.rows.map((x) => [x.column_name, x.udt_name])));
    p.catch(() => columnTypes.delete(key));
    columnTypes.set(key, p);
  }
  return p;
}

function encode(v: unknown, udt: string | undefined): unknown {
  if (v === null || v === undefined) return null;
  if (udt === "json" || udt === "jsonb") return JSON.stringify(v);
  if (udt === "vector" && Array.isArray(v)) return JSON.stringify(v);
  return v;
}

function toError(e: unknown): DbError {
  const x = e as { message?: string; code?: string; detail?: string; hint?: string };
  return { message: x.message ?? String(e), code: x.code ?? "", details: x.detail, hint: x.hint };
}

type Op = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
const OPS: Record<Op, string> = { eq: "=", neq: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=" };

// A where-clause fragment; `$?` placeholders are numbered at build time.
type Cond = { sql: string; params: unknown[] };

function isCond(col: string, v: unknown, negate = false): Cond {
  const kw = v === null || v === "null" ? "null" : v === true || v === "true" ? "true" : v === false || v === "false" ? "false" : null;
  if (!kw) throw Object.assign(new Error(`invalid "is" value: ${String(v)}`), { code: "22023" });
  return { sql: `${ident(col)} is ${negate ? "not " : ""}${kw}`, params: [] };
}

function listValues(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  const s = String(v).trim();
  return s.replace(/^\(|\)$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
}

// PostgREST's `or` syntax, as used here: "col.op.value,col.op.value".
function orCond(expr: string): Cond {
  const parts = expr.split(",").map((p) => {
    const [col, op, ...rest] = p.split(".");
    const val = rest.join(".");
    if (op === "is") return isCond(col, val);
    if (op in OPS) return { sql: `${ident(col)} ${OPS[op as Op]} $?`, params: [val] };
    throw Object.assign(new Error(`unsupported or() operator: ${op}`), { code: "22023" });
  });
  return { sql: `(${parts.map((p) => p.sql).join(" or ")})`, params: parts.flatMap((p) => p.params) };
}

type Mode = "select" | "insert" | "update" | "delete" | "upsert";

class Query<D = any[]> implements PromiseLike<DbResult<D>> {
  private mode: Mode = "select";
  private cols = "*";
  private returning: string | null = null;
  private where: Cond[] = [];
  private orders: string[] = [];
  private lim: number | null = null;
  private countOnly = false;
  private withCount = false;
  private one: "single" | "maybe" | null = null;
  private values: Row[] = [];
  private onConflict: string[] = [];
  private ignoreDuplicates = false;
  private bad: unknown = null;

  constructor(
    private readonly schema: string,
    private readonly table: string,
  ) {}

  // Errors while chaining surface in the result, like every other failure.
  private add(f: () => Cond) {
    try {
      this.where.push(f());
    } catch (e) {
      this.bad ??= e;
    }
    return this;
  }

  select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.mode === "select") this.cols = cols;
    else this.returning = cols;
    if (opts?.count) this.withCount = true;
    if (opts?.head) this.countOnly = true;
    return this;
  }
  insert(v: Row | Row[]) {
    this.mode = "insert";
    this.values = Array.isArray(v) ? v : [v];
    return this;
  }
  upsert(v: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = "upsert";
    this.values = Array.isArray(v) ? v : [v];
    this.onConflict = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }
  update(v: Row) {
    this.mode = "update";
    this.values = [v];
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  private cmp(op: Op, col: string, v: unknown) {
    return this.add(() => ({ sql: `${ident(col)} ${OPS[op]} $?`, params: [v] }));
  }
  eq(col: string, v: unknown) { return this.cmp("eq", col, v); }
  neq(col: string, v: unknown) { return this.cmp("neq", col, v); }
  lt(col: string, v: unknown) { return this.cmp("lt", col, v); }
  lte(col: string, v: unknown) { return this.cmp("lte", col, v); }
  gt(col: string, v: unknown) { return this.cmp("gt", col, v); }
  gte(col: string, v: unknown) { return this.cmp("gte", col, v); }
  in(col: string, v: unknown[]) {
    return this.add(() => ({ sql: `${ident(col)} = any($?)`, params: [v] }));
  }
  is(col: string, v: null | boolean) {
    return this.add(() => isCond(col, v));
  }
  not(col: string, op: "in" | "is", v: unknown) {
    return this.add(() =>
      op === "is" ? isCond(col, v, true) : { sql: `not (${ident(col)} = any($?))`, params: [listValues(v)] },
    );
  }
  or(expr: string) {
    return this.add(() => orCond(expr));
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opts?.ascending ?? true;
    const nulls = opts?.nullsFirst === undefined ? "" : opts.nullsFirst ? " nulls first" : " nulls last";
    this.orders.push(`${col} ${asc ? "asc" : "desc"}${nulls}`);
    return this;
  }
  limit(n: number) {
    this.lim = Math.max(0, Math.floor(n));
    return this;
  }
  single(): Query<any> {
    this.one = "single";
    return this;
  }
  maybeSingle(): Query<any> {
    this.one = "maybe";
    return this;
  }

  then<A = DbResult<D>, B = never>(
    ok?: ((r: DbResult<D>) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(ok, bad);
  }

  private async run(): Promise<DbResult> {
    const p = pool();
    if (!p) return { data: null, error: { message: "DATABASE_URL is not set", code: "08001" }, count: null };
    try {
      if (this.bad) throw this.bad;
      return await this.exec(p);
    } catch (e) {
      return { data: null, error: toError(e), count: null };
    }
  }

  private columns(list: string): string {
    return list.trim() === "*" ? "*" : list.split(",").map(ident).join(", ");
  }

  private whereSql(params: unknown[]): string {
    if (!this.where.length) return "";
    const parts = this.where.map((c) => {
      let i = 0;
      return c.sql.replace(/\$\?/g, () => {
        params.push(c.params[i++]);
        return `$${params.length}`;
      });
    });
    return ` where ${parts.join(" and ")}`;
  }

  private async exec(p: Pool): Promise<DbResult> {
    const t = `${ident(this.schema)}.${ident(this.table)}`;
    const params: unknown[] = [];
    let sql: string;

    if (this.mode === "select") {
      const where = this.whereSql(params);
      let count: number | null = null;
      if (this.withCount) {
        const r = await p.query(`select count(*)::int as n from ${t}${where}`, params);
        count = r.rows[0].n;
        if (this.countOnly) return { data: null, error: null, count };
      }
      sql = `select ${this.columns(this.cols)} from ${t}${where}`;
      if (this.orders.length) sql += ` order by ${this.orders.map((o) => o.replace(/^\S+/, ident)).join(", ")}`;
      if (this.lim !== null) sql += ` limit ${this.lim}`;
      return this.shape((await p.query(sql, params)).rows, count);
    }

    if (this.mode === "delete") {
      sql = `delete from ${t}${this.whereSql(params)}`;
    } else if (this.mode === "update") {
      const udt = await typesOf(p, this.schema, this.table);
      const set = Object.entries(this.values[0])
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => {
          params.push(encode(v, udt.get(k)));
          return `${ident(k)} = $${params.length}`;
        });
      if (!set.length) return { data: null, error: null, count: null };
      sql = `update ${t} set ${set.join(", ")}${this.whereSql(params)}`;
    } else {
      if (!this.values.length) return { data: this.returning === null ? null : [], error: null, count: null };
      const udt = await typesOf(p, this.schema, this.table);
      const keys = [...new Set(this.values.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)))];
      const cols = keys.map(ident);
      const rows = this.values.map(
        (r) =>
          `(${keys
            .map((k) => {
              if (r[k] === undefined) return "default";
              params.push(encode(r[k], udt.get(k)));
              return `$${params.length}`;
            })
            .join(", ")})`,
      );
      sql = cols.length
        ? `insert into ${t} (${cols.join(", ")}) values ${rows.join(", ")}`
        : `insert into ${t} default values`;
      if (this.mode === "upsert") {
        const target = this.onConflict.map(ident).join(", ");
        const updates = keys.filter((k) => !this.onConflict.includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`);
        sql +=
          this.ignoreDuplicates || !updates.length
            ? ` on conflict (${target}) do nothing`
            : ` on conflict (${target}) do update set ${updates.join(", ")}`;
      }
    }

    if (this.returning === null) {
      await p.query(sql, params);
      return { data: null, error: null, count: null };
    }
    sql += ` returning ${this.columns(this.returning)}`;
    return this.shape((await p.query(sql, params)).rows, null);
  }

  private shape(rows: Row[], count: number | null): DbResult {
    if (!this.one) return { data: rows, error: null, count };
    if (rows.length === 1) return { data: rows[0], error: null, count };
    if (rows.length === 0 && this.one === "maybe") return { data: null, error: null, count };
    return {
      data: null,
      error: { message: `JSON object requested, multiple (or no) rows returned (${rows.length})`, code: "PGRST116" },
      count,
    };
  }
}

// Function shapes, so rpc() returns what PostgREST did: the rows of a
// set-returning function, the value of a scalar one, null for void.
const fnShapes = new Map<string, Promise<{ set: boolean; isVoid: boolean; argTypes: Map<string, string> }>>();
function shapeOf(p: Pool, schema: string, fn: string) {
  const key = `${schema}.${fn}`;
  let s = fnShapes.get(key);
  if (!s) {
    s = p
      .query<{ set: boolean; ret: string; names: string[] | null; argtypes: string[] }>(
        `select p.proretset as set, format_type(p.prorettype, null) as ret, p.proargnames as names,
                array(select format_type(t, null) from unnest(p.proargtypes) t) as argtypes
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = $1 and p.proname = $2
          limit 1`,
        [schema, fn],
      )
      .then((r) => {
        const row = r.rows[0];
        if (!row) throw Object.assign(new Error(`function ${schema}.${fn} does not exist`), { code: "42883" });
        const argTypes = new Map((row.names ?? []).map((n, i) => [n, row.argtypes[i]]));
        return { set: row.set, isVoid: row.ret === "void", argTypes };
      });
    s.catch(() => fnShapes.delete(key));
    fnShapes.set(key, s);
  }
  return s;
}

async function rpc(schema: string, fn: string, args: Row = {}): Promise<DbResult> {
  const p = pool();
  if (!p) return { data: null, error: { message: "DATABASE_URL is not set", code: "08001" }, count: null };
  try {
    const name = `${ident(schema)}.${ident(fn)}`;
    const shape = await shapeOf(p, schema, fn);
    const params: unknown[] = [];
    const named = Object.entries(args)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        const t = shape.argTypes.get(k) ?? "";
        params.push(encode(v, t === "json" || t === "jsonb" ? t : t.startsWith("vector") ? "vector" : undefined));
        return `${ident(k)} => $${params.length}`;
      })
      .join(", ");
    if (shape.set) return { data: (await p.query(`select * from ${name}(${named})`, params)).rows, error: null, count: null };
    const r = await p.query(`select ${name}(${named}) as v`, params);
    return { data: shape.isVoid ? null : r.rows[0].v, error: null, count: null };
  } catch (e) {
    return { data: null, error: toError(e), count: null };
  }
}

// `schema` mirrors supabase-js's .schema(): Kolab Studio's tables live in `kolab`.
const inSchema = (schema: string) => ({
  from: (table: string) => new Query(schema, table),
  rpc: (fn: string, args?: Row) => rpc(schema, fn, args),
});
const db = { ...inSchema("public"), schema: inSchema };
export type Db = typeof db;

export function getDb(): Db | null {
  return process.env.DATABASE_URL ? db : null;
}
