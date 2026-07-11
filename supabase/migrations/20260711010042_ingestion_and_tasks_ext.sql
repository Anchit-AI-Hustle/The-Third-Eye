-- JARVIS OS — ingestion foundation (Gmail + Google Chat scraping → tasks)
-- Run in Supabase Dashboard → SQL Editor. Service-role only (no client policy).

-- Unified dedup ledger: one row per already-processed source message.
create table if not exists processed_messages (
  user_id      text not null,          -- the signed-in user's email
  source       text not null,          -- 'gmail' | 'chat'
  message_id   text not null,          -- Gmail message id or Chat message id
  processed_at timestamptz not null default now(),
  primary key (user_id, source, message_id)
);
create index if not exists processed_messages_user_idx on processed_messages(user_id);
alter table processed_messages enable row level security;

-- Per-space high-water mark for Google Chat polling (advance monotonically).
create table if not exists chat_watermarks (
  user_id          text not null,
  space_name       text not null,      -- e.g. spaces/AAAA
  last_create_time text,               -- RFC3339 createTime of last processed msg
  updated_at       timestamptz not null default now(),
  primary key (user_id, space_name)
);
alter table chat_watermarks enable row level security;
-- JARVIS OS — task-table extension for extraction/dedup + activity trail.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run (IF NOT EXISTS).

-- Extend the existing tasks table with the ingestion/extraction fields
-- (ported from Personal-AI-OS extracted_tasks).
alter table tasks add column if not exists source_type text;
alter table tasks add column if not exists source_ref_id text;
alter table tasks add column if not exists source_detail text;
alter table tasks add column if not exists source_link text;
alter table tasks add column if not exists rationale text;
alter table tasks add column if not exists growth_pillar text;
alter table tasks add column if not exists spoc text;
alter table tasks add column if not exists spoc_contact text;
alter table tasks add column if not exists date_given text;
alter table tasks add column if not exists all_updates text;
alter table tasks add column if not exists normalized_heading text;
alter table tasks add column if not exists dedupe_hash text;
alter table tasks add column if not exists transcription_accuracy int;
alter table tasks add column if not exists accuracy_explanation text;
alter table tasks add column if not exists user_remarks text;

-- Hard dedup: one row per (user, source_type|source_ref_id|task) hash.
create unique index if not exists tasks_user_dedupe_idx on tasks(user_id, dedupe_hash)
  where dedupe_hash is not null;
-- Soft-merge lookup: open tasks by normalized heading + spoc.
create index if not exists tasks_user_norm_idx on tasks(user_id, normalized_heading);

-- Day-wise activity trail.
create table if not exists activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  day        text not null,            -- YYYY-MM-DD (local day of the entry)
  kind       text not null,            -- 'ingestion' | 'command' | ...
  title      text not null,
  detail     text,
  status     text not null default 'done',
  context    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_user_day_idx on activity_log(user_id, day);
alter table activity_log enable row level security;
create policy "users own activity" on activity_log for all using (auth.jwt() ->> 'email' = user_id);
