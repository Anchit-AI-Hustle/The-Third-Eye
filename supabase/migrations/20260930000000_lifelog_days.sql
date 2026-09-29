-- Life Log cloud mirror: one row per user per local day (id = the date).
-- lib/lifelog/store.ts has written here since Life Log shipped, but the table
-- never existed and the entity was not on /api/data's allowlist, so every save
-- was silently dropped and nothing ever synced across devices.
create table if not exists lifelog_days (
  user_id text not null,
  id text not null,
  date text not null,
  segments jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  diary jsonb not null default '[]'::jsonb,
  summary text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table lifelog_days enable row level security;
drop policy if exists "users own lifelog_days" on lifelog_days;
create policy "users own lifelog_days" on lifelog_days for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
