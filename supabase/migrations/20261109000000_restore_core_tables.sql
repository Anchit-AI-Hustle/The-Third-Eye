-- Restores four tables the app reads and writes on every request path that
-- touches them, which no migration created: they lived in supabase-schema-*.sql
-- files that were archived (docs/archive/supabase-schema) before the move to
-- Supabase, so this database never had them. Production logged
-- 'relation "public.reminders" does not exist': reminders, automations, the
-- daily digest, push notifications and plan tiers all failed. Definitions are
-- the archived ones, unchanged and idempotent.

create table if not exists reminders (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  title text not null,
  body text,
  fire_at timestamptz not null,
  recurrence text,
  channel text not null default 'email',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists reminders_user_id_idx on reminders(user_id);
create index if not exists reminders_due_idx on reminders(status, fire_at);
alter table reminders enable row level security;
drop policy if exists "users own reminders" on reminders;
create policy "users own reminders" on reminders for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);

create table if not exists notification_log (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  kind text not null,
  ref_id text,
  channel text not null,
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_user_idx on notification_log(user_id, kind, created_at);
alter table notification_log enable row level security;
drop policy if exists "users read own notifications" on notification_log;
create policy "users read own notifications" on notification_log for select using (auth.jwt() ->> 'email' = user_id);

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
drop policy if exists "users own push subs" on push_subscriptions;
create policy "users own push subs" on push_subscriptions for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);

create table if not exists profiles (
  user_id text primary key,
  subscription_tier text not null default 'free',
  subscription_status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- An older profiles table may already exist with other columns; index only what is there.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'stripe_customer_id') then
    create index if not exists profiles_customer_idx on profiles(stripe_customer_id);
  end if;
end $$;
alter table profiles enable row level security;
drop policy if exists "users read own profile" on profiles;
create policy "users read own profile" on profiles for select using (auth.jwt() ->> 'email' = user_id);
