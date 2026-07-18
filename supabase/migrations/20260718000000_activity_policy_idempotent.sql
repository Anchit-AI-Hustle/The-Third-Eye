-- Make the activity_log RLS policy idempotent.
--
-- The earlier migration 20260711010042_ingestion_and_tasks_ext.sql ends with a
-- bare `create policy "users own activity" …`, which fails with 42710 ("policy
-- already exists") on any re-run or when the objects were first created via the
-- SQL editor. Dropping-then-creating makes it safe to (re)apply anywhere.
drop policy if exists "users own activity" on activity_log;
create policy "users own activity" on activity_log
  for all using (auth.jwt() ->> 'email' = user_id);
