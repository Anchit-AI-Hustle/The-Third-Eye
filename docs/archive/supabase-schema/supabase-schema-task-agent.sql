-- The Third Eye — task-level agent appointment.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run (IF NOT EXISTS).

-- Which AI agent profile (jarvis | friday | edith | ultron | zeus | athena |
-- custom_*) is appointed to a task. One agent can be appointed to any number
-- of tasks.
alter table tasks add column if not exists agent text;
