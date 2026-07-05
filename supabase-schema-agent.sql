-- JARVIS OS — Agent delivery: encrypted Google tokens + notification log
-- Run after supabase-schema.sql and supabase-schema-billing.sql.

-- Encrypted Google OAuth refresh token per user, so the cron dispatcher can send
-- reminders / digests on the user's behalf while they're away. The token is
-- AES-256-GCM encrypted in the app (TOKEN_ENCRYPTION_KEY) before it ever lands here.
create table if not exists google_tokens (
  user_id text primary key,
  refresh_token_enc text not null,
  scope text,
  updated_at timestamptz not null default now()
);
alter table google_tokens enable row level security;
-- No client policy: only the service-role key (server) touches this table.

-- Idempotency + audit for outbound notifications.
create table if not exists notification_log (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  kind text not null,            -- 'reminder' | 'daily_digest'
  ref_id text,                   -- reminder id, or a date for digests
  channel text not null,         -- 'email' | 'push'
  status text not null,          -- 'sent' | 'failed'
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_user_idx on notification_log(user_id, kind, created_at);
create unique index if not exists notification_log_dedupe
  on notification_log(user_id, kind, ref_id, channel) where ref_id is not null;
alter table notification_log enable row level security;
create policy "users read own notifications" on notification_log for select using (auth.jwt() ->> 'email' = user_id);

-- Web-push subscriptions (browser/native Push API) for instant reminders.
create table if not exists push_subscriptions (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;
create policy "users own push subs" on push_subscriptions for all using (auth.jwt() ->> 'email' = user_id);
