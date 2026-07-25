-- Task Tracker ingestion columns.
--
-- The Gmail/Chat scrape (lib/ingest.ts → lib/tasks.ts::saveExtractedTasks) writes
-- these columns into `tasks`. If they're missing, every ingest INSERT fails and
-- the tracker shows NO captured tasks — which is exactly the "task tracker isn't
-- using gmail data" symptom. Idempotent: safe to run whether or not `tasks`
-- already has some of them.

alter table if exists public.tasks
  add column if not exists source_type       text,
  add column if not exists source_ref_id     text,
  add column if not exists source_detail     text,
  add column if not exists source_link       text,
  add column if not exists rationale         text,
  add column if not exists growth_pillar     text,
  add column if not exists spoc              text,
  add column if not exists spoc_contact      text,
  add column if not exists date_given        text,
  add column if not exists normalized_heading text,
  add column if not exists dedupe_hash       text,
  add column if not exists all_updates       text,
  add column if not exists updated_at        timestamptz default now();

-- Hard dedup: one task per (user, source_type, source_ref_id, heading) hash.
create unique index if not exists tasks_user_dedupe_hash_idx
  on public.tasks (user_id, dedupe_hash) where dedupe_hash is not null;

-- Soft-merge lookup: (user, status, normalized_heading) then spoc equality.
create index if not exists tasks_user_norm_heading_idx
  on public.tasks (user_id, status, normalized_heading);
