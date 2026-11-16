-- Cross-device handoff: an action asked for on one device (a WhatsApp, SMS or
-- call from the laptop) is queued for the user's phone, which opens it there.
create table if not exists device_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action text not null,
  url text not null,
  native_url text,
  label text not null default '',
  detail text not null default '',
  status text not null default 'pending' check (status in ('pending', 'opened', 'dismissed')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists device_handoffs_pending on device_handoffs (user_id, created_at desc) where status = 'pending';

-- The last time each user's phone checked in, so the laptop knows a phone is there to take it.
create table if not exists handoff_phones (
  user_id text primary key,
  seen_at timestamptz not null default now()
);

alter table device_handoffs enable row level security;
drop policy if exists "users own device_handoffs" on device_handoffs;
create policy "users own device_handoffs" on device_handoffs for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);

alter table handoff_phones enable row level security;
drop policy if exists "users own handoff_phones" on handoff_phones;
create policy "users own handoff_phones" on handoff_phones for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
