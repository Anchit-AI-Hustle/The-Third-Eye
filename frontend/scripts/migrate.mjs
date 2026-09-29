import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Applies the repo's SQL to the Neon database before `next build`, once per file.
// Preview deployments share the production database, so only production builds
// (or a local build pointed at its own DATABASE_URL) may migrate.

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("migrate: no DATABASE_URL, skipping");
  process.exit(0);
}
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`migrate: ${process.env.VERCEL_ENV} build, skipping`);
  process.exit(0);
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

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("select pg_advisory_lock(7317001)");
  await client.query(readFileSync(join(root, "supabase", "neon-compat.sql"), "utf8"));
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
      console.log(`migrate: applied ${f}`);
    } catch (e) {
      await client.query("rollback");
      console.error(`migrate: ${f} failed — ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}
