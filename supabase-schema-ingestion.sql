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
