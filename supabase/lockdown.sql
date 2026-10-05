-- The app reaches Postgres only as the table owner (DATABASE_URL), never through
-- Supabase's Data API. But Supabase grants anon and authenticated full access to
-- every table it sees created, and the publishable key is public, so anything
-- left granted is readable and writable by anyone through /rest/v1 and
-- /graphql/v1 — RLS policies keyed on auth.jwt() are then the only thing in the
-- way, and app_migrations had none. This takes the API roles off the app's
-- schemas entirely and turns RLS on everywhere as a second line.
--
-- Re-applied after every migration run, not recorded as one: a later migration,
-- or data restored from a dump, creates objects that would otherwise come back
-- granted.

do $$
declare
  s text;
  t regclass;
begin
  foreach s in array array['public', 'kolab'] loop
    continue when to_regnamespace(s) is null;
    execute format('revoke all on all tables in schema %I from anon, authenticated', s);
    execute format('revoke all on all sequences in schema %I from anon, authenticated', s);
    execute format('revoke all on all functions in schema %I from anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on tables from anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on sequences from anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on functions from anon, authenticated', s);
    for t in
      select c.oid::regclass from pg_class c
      where c.relnamespace = s::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
        and pg_has_role(c.relowner, 'USAGE')
    loop
      execute format('alter table %s enable row level security', t);
    end loop;
  end loop;
end $$;
