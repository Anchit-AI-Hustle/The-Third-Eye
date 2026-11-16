-- The Third Eye — device activity logs → AI Log Sync → Task Tracker.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run (IF NOT EXISTS).

-- Raw usage events pushed by every device the app runs on (computer / phone).
-- Service-role only (no client policy) — the browser writes via /api/device-log.
create table if not exists device_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  device     text not null,            -- e.g. 'Windows PC' | 'iPhone' | 'Android phone'
  platform   text,                     -- raw userAgent hint
  kind       text not null,            -- 'app_usage'
  title      text not null,            -- page/app title
  url        text,                     -- in-app path
  detail     text,
  duration_s int,
  started_at timestamptz not null,
  ended_at   timestamptz,
  processed  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists device_logs_user_pending_idx on device_logs(user_id, processed, started_at);
alter table device_logs enable row level security;

-- Workspace split for the Task Tracker tabs: 'office' (Vahdam) | 'personal'.
alter table tasks add column if not exists workspace text;
