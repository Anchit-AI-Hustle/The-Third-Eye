-- Music Studio library: every generated track, per user.
create table if not exists music_tracks (
  id uuid primary key,
  user_id text not null,
  title text,
  description text,
  prompt text,
  lyrics text,
  audio_url text,
  video_url text,
  params jsonb,
  created_at timestamptz not null default now()
);

create index if not exists music_tracks_user_idx on music_tracks (user_id, created_at desc);

alter table music_tracks enable row level security;
drop policy if exists "users own music_tracks" on music_tracks;
create policy "users own music_tracks" on music_tracks for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
