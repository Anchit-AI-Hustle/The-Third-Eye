-- Music Studio "daily drop": a saved style that the daily cron turns into a new
-- song every day.
--
-- The audio is stored here because nothing else will keep it: Replicate deletes
-- prediction outputs after about an hour, long before anyone listens to a track
-- made overnight. It is split into 1 MiB chunks because a Vercel function cannot
-- return a body over 4.5 MB — the player streams it back by byte range.
create table if not exists music_daily (
  user_id    text primary key,
  enabled    boolean not null default true,
  preset     jsonb not null,
  refs       text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists music_daily_tracks (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  day           date not null,
  title         text not null,
  theme         text not null default '',
  tags          text not null default '',
  lyrics        text not null default '',
  bpm           int,
  status        text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  prediction_id text,
  token         text not null unique,
  audio_type    text,
  size          int,
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  unique (user_id, day)
);
create index if not exists music_daily_tracks_user_day on music_daily_tracks (user_id, day desc);

create table if not exists music_daily_chunks (
  track_id uuid not null references music_daily_tracks(id) on delete cascade,
  n        int not null,
  data     bytea not null,
  primary key (track_id, n)
);

alter table music_daily enable row level security;
drop policy if exists "users own music_daily" on music_daily;
create policy "users own music_daily" on music_daily for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);

alter table music_daily_tracks enable row level security;
drop policy if exists "users own music_daily_tracks" on music_daily_tracks;
create policy "users own music_daily_tracks" on music_daily_tracks for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);

-- Only ever reached through its track, which is owner-checked.
alter table music_daily_chunks enable row level security;
