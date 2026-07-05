-- JARVIS OS — Billing, usage metering, and reminders
-- Run in Supabase Dashboard → SQL Editor (after supabase-schema.sql).
-- Everything here is additive; the app degrades to unlimited-free when these
-- tables / the service-role key are absent.

-- Per-user subscription state. Keyed by email to match the rest of the schema.
create table if not exists profiles (
  user_id text primary key,
  subscription_tier text not null default 'free',      -- 'free' | 'premium'
  subscription_status text not null default 'inactive', -- 'active' | 'inactive' | 'past_due' | 'canceled'
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_customer_idx on profiles(stripe_customer_id);
alter table profiles enable row level security;
create policy "users read own profile" on profiles for select using (auth.jwt() ->> 'email' = user_id);
-- Writes happen only via the service-role key in server routes (bypasses RLS).

-- Usage counters, one row per (user, metric, day). Server increments atomically.
create table if not exists usage_counters (
  user_id text not null,
  metric text not null,          -- 'chat' | 'web_search' | 'reminder' | ...
  day date not null default current_date,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, day)
);
alter table usage_counters enable row level security;
create policy "users read own usage" on usage_counters for select using (auth.jwt() ->> 'email' = user_id);

-- Atomic increment + read. Returns the new count for the day.
create or replace function increment_usage(p_user_id text, p_metric text, p_amount int default 1)
returns integer
language plpgsql
security definer
as $$
declare
  new_count integer;
begin
  insert into usage_counters (user_id, metric, day, count, updated_at)
  values (p_user_id, p_metric, current_date, p_amount, now())
  on conflict (user_id, metric, day)
  do update set count = usage_counters.count + p_amount, updated_at = now()
  returning count into new_count;
  return new_count;
end;
$$;

-- Scheduled reminders (premium: unlimited + recurring). Fired by the cron route.
create table if not exists reminders (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  title text not null,
  body text,
  fire_at timestamptz not null,
  recurrence text,               -- null | 'daily' | 'weekly' | 'monthly'
  channel text not null default 'email', -- 'email' | 'push'
  status text not null default 'pending', -- 'pending' | 'sent' | 'canceled'
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists reminders_user_id_idx on reminders(user_id);
create index if not exists reminders_due_idx on reminders(status, fire_at);
alter table reminders enable row level security;
create policy "users own reminders" on reminders for all using (auth.jwt() ->> 'email' = user_id);

alter publication supabase_realtime add table reminders;
