-- Stand-ins for the Supabase platform objects the schema files below were
-- written against, for a database that is not Supabase (local Postgres, CI,
-- Neon). On Supabase every one of these already exists and belongs to the
-- platform — auth.* to supabase_auth_admin, which the app's `postgres` role may
-- not touch — so each is created only when missing, never replaced. Replacing
-- them failed the build with "permission denied for schema auth", and on a
-- schema it could write to would have swapped Supabase's real auth.jwt() for a
-- stub. Idempotent: applied before every migration run.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;

  if to_regnamespace('auth') is null then create schema auth; end if;
  if to_regprocedure('auth.jwt()') is null then
    create function auth.jwt() returns jsonb language sql stable as 'select ''{}''::jsonb';
  end if;
  if to_regprocedure('auth.uid()') is null then
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
  end if;
  if to_regprocedure('auth.role()') is null then
    create function auth.role() returns text language sql stable as 'select null::text';
  end if;

  -- Supabase's own event-trigger helper; migrations revoke grants on it.
  if to_regprocedure('public.rls_auto_enable()') is null then
    create function public.rls_auto_enable() returns void language sql as '';
  end if;

  -- Supabase CLI bookkeeping, which one migration tidies.
  if to_regnamespace('supabase_migrations') is null then create schema supabase_migrations; end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    create table supabase_migrations.schema_migrations (version text primary key);
  end if;
end $$;

create extension if not exists vector;
create extension if not exists pgcrypto;
