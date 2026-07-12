-- The Third Eye — Task Tracker UI columns.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run (IF NOT EXISTS).
--
-- The Task Tracker UI reads/writes these fields, but the base `tasks` table
-- (supabase-schema.sql) didn't define them, so inserts that set them failed.
alter table tasks add column if not exists assignee     text;
alter table tasks add column if not exists start_date   text;
alter table tasks add column if not exists completed_at text;
