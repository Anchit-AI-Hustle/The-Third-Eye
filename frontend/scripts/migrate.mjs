import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { isSupabase, pgConnection } from "../src/lib/pgConnection.mjs";

// Applies the repo's SQL to the database before `next build`, once per file.
// Preview deployments share the production database, so only production builds
// (or a local build pointed at its own DATABASE_URL) may migrate.

// The app queries DATABASE_URL (lib/db.ts); the build prefers the unpooled
// connection for DDL. Both are migrated: if they ever point at different
// databases, the one the app reads must not be left without its tables.
const urls = [...new Set([process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL].filter(Boolean))];
if (!urls.length) {
  console.log("migrate: no DATABASE_URL, skipping");
  process.exit(0);
}
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`migrate: ${process.env.VERCEL_ENV} build, skipping`);
  process.exit(0);
}

// This app's data lives in Supabase only; another host (a Neon integration's
// DATABASE_URL, say) means the deployment is pointed at the wrong database.
for (const url of urls) {
  if (process.env.VERCEL && !isSupabase(url)) {
    console.warn(`::warning title=migrate::${new URL(url).hostname} is not a Supabase database. Set DATABASE_URL and DATABASE_URL_UNPOOLED to the Supabase project's connection strings.`);
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrations = join(root, "supabase", "migrations");
if (!existsSync(migrations)) {
  console.error(`migrate: ${migrations} is not in the build — enable "Include files outside the root directory".`);
  process.exit(1);
}

const sorted = (dir, pick) => readdirSync(dir).filter(pick).sort();
const files = [
  "supabase-schema.sql",
  ...sorted(root, (f) => f.startsWith("supabase-schema-") && f.endsWith(".sql")),
  ...sorted(migrations, (f) => f.endsWith(".sql")).map((f) => join("supabase", "migrations", f)),
];

// A database that refuses the connection itself (out of plan quota, asleep,
// unreachable) must not also block the deploy: the app ships, and the pending
// files apply on the next production build that can connect. A migration that
// fails once connected still fails the build.
const UNAVAILABLE = new Set(["53000", "53300", "57P03", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"]);
async function migrate(url) {
const where = `${new URL(url).hostname}/${new URL(url).pathname.slice(1) || "postgres"}`;
console.log(`migrate: ${where}`);
const client = new pg.Client(pgConnection(url));
try {
  await client.connect();
} catch (e) {
  if (!UNAVAILABLE.has(e.code) && !/quota/i.test(e.message)) throw e;
  console.warn(`::warning title=migrate::database ${where} unavailable (${e.code ?? "no code"}: ${e.message}); migrations skipped until the next production build`);
  return;
}
try {
  // A session lock through the transaction pooler (port 6543) would be left on
  // a pooled backend and block every later build, so only direct connections lock.
  const pooled = new URL(url).port === "6543";
  if (!pooled) await client.query("select pg_advisory_lock(7317001)");
  await client.query(readFileSync(join(root, "supabase", "platform-compat.sql"), "utf8"));
  await client.query(
    "create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set((await client.query("select name from public.app_migrations")).rows.map((r) => r.name));
  for (const f of files.filter((f) => !done.has(f))) {
    await client.query("begin");
    try {
      await client.query(readFileSync(join(root, f), "utf8"));
      await client.query("insert into public.app_migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log(`migrate: ${where}: applied ${f}`);
    } catch (e) {
      await client.query("rollback");
      console.error(`migrate: ${where}: ${f} failed — ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
  await heal(client, where);
  await client.query(readFileSync(join(root, "supabase", "lockdown.sql"), "utf8"));
} finally {
  await client.end();
}
}

// A file can be recorded as applied while its tables are gone (production had
// app_migrations rows for the base schema but no notes, goals or team_members).
// Every file whose public tables are missing is run again, each in its own
// transaction; one that still fails is reported without failing the build.
const TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
async function heal(client, where) {
  for (const f of files) {
    const sql = readFileSync(join(root, f), "utf8");
    const tables = [...new Set([...sql.matchAll(TABLE)].map((m) => m[1].toLowerCase()))];
    if (!tables.length) continue;
    const { rows } = await client.query("select t from unnest($1::text[]) t where to_regclass('public.' || quote_ident(t)) is null", [tables]);
    if (!rows.length) continue;
    const missing = rows.map((r) => r.t).join(", ");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public.app_migrations (name) values ($1) on conflict do nothing", [f]);
      await client.query("commit");
      console.log(`migrate: ${where}: re-applied ${f} (was missing ${missing})`);
    } catch (e) {
      await client.query("rollback");
      console.warn(`::warning title=migrate::${where}: ${f} is missing ${missing} and could not be re-applied: ${e.message}`);
    }
  }
}

for (const url of urls) await migrate(url);
