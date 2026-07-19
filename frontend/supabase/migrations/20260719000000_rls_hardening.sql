-- RLS hardening — make the data layer's security posture reproducible.
--
-- Until now, Row Level Security + owner policies lived only in the loose
-- supabase-schema-*.sql files that had to be pasted into the SQL editor by hand.
-- That means a fresh environment (or anyone who never ran those files) could end
-- up with RLS OFF while the public anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) is
-- shipped to every browser — i.e. the whole table readable/writable by anyone.
--
-- This migration puts the security posture in the tracked migration history so
-- `supabase db push` guarantees it. It is fully idempotent (safe to re-run):
-- it enables RLS and (re)creates one owner policy per user-data table, keyed on
-- the session email, with an explicit WITH CHECK so inserts/updates can't set a
-- foreign user_id. The app itself talks to these tables via the service-role
-- server route (which bypasses RLS), so this changes nothing for the app — it
-- only locks the door against direct anon-key access.

-- ── User-owned tables: enable RLS + owner policy (select/insert/update/delete) ──
do $$
declare r record;
begin
  for r in
    select * from (values
      ('tasks',          'users own tasks'),
      ('team_members',   'users own team_members'),
      ('notes',          'users own notes'),
      ('goals',          'users own goals'),
      ('knowledge_docs', 'users own knowledge_docs'),
      ('jarvis_memory',  'users own memory'),
      ('expenses',       'users own expenses'),
      ('reminders',      'users own reminders'),
      ('activity_log',   'users own activity'),
      ('cortex_memories','users own cortex memories'),
      ('cortex_doc_chunks','users own cortex chunks'),
      ('push_subscriptions','users own push subs')
    ) as x(tbl, pol)
  loop
    if to_regclass(r.tbl) is not null then
      execute format('alter table %I enable row level security', r.tbl);
      execute format('drop policy if exists %I on %I', r.pol, r.tbl);
      execute format(
        'create policy %I on %I for all using (auth.jwt() ->> ''email'' = user_id) with check (auth.jwt() ->> ''email'' = user_id)',
        r.pol, r.tbl);
    end if;
  end loop;
end $$;

-- ── Read-only-for-owner tables (writes happen server-side only) ──
do $$
declare r record;
begin
  for r in
    select * from (values
      ('profiles',         'users read own profile'),
      ('usage_counters',   'users read own usage'),
      ('notification_log', 'users read own notifications')
    ) as x(tbl, pol)
  loop
    if to_regclass(r.tbl) is not null then
      execute format('alter table %I enable row level security', r.tbl);
      execute format('drop policy if exists %I on %I', r.pol, r.tbl);
      execute format(
        'create policy %I on %I for select using (auth.jwt() ->> ''email'' = user_id)',
        r.pol, r.tbl);
    end if;
  end loop;
end $$;

-- ── Service-role-only tables: RLS ON with NO policy → anon/authed get nothing.
-- OAuth tokens and ingestion bookkeeping must never be client-reachable. ──
do $$
declare t text;
begin
  foreach t in array array['google_tokens','processed_messages','chat_watermarks'] loop
    if to_regclass(t) is not null then
      execute format('alter table %I enable row level security', t);
    end if;
  end loop;
end $$;
