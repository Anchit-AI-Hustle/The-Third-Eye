-- Neon has none of the Supabase platform objects the schema files below were
-- written against. These stand-ins let those files apply unchanged. The app
-- connects as the table owner, so the RLS policies they create are inert here;
-- auth.jwt() only has to exist for them to be created. Idempotent: applied
-- before every migration run.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;

create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select null::text $$;

-- Supabase's own event-trigger helper; migrations revoke grants on it.
create or replace function public.rls_auto_enable() returns void language sql as $$ $$;

-- Supabase CLI bookkeeping, which one migration tidies.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key);

create extension if not exists vector;
create extension if not exists pgcrypto;
