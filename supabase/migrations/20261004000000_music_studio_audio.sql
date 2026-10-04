-- Music Studio songs made by Eleven Music (ElevenLabs).
--
-- The service answers with the finished file and keeps no copy we can link to,
-- so the audio is stored here, in 1 MiB chunks like music_daily_chunks: a
-- Vercel function cannot return a body over 4.5 MB, and the player and the
-- Download button read it back by byte range. music_tracks rows keep only the
-- short /api/tools/music/audio/<id> path, never the bytes.
create table if not exists music_studio_audio (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  audio_type text not null default 'audio/mpeg',
  size       int not null,
  provider   text not null default 'elevenlabs',
  song_id    text,
  created_at timestamptz not null default now()
);
create index if not exists music_studio_audio_user on music_studio_audio (user_id, created_at desc);

create table if not exists music_studio_audio_chunks (
  audio_id uuid not null references music_studio_audio(id) on delete cascade,
  n        int not null,
  data     bytea not null,
  primary key (audio_id, n)
);

alter table music_studio_audio enable row level security;
drop policy if exists "users own music_studio_audio" on music_studio_audio;
create policy "users own music_studio_audio" on music_studio_audio for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);

-- Only ever reached through its audio row, which is owner-checked.
alter table music_studio_audio_chunks enable row level security;
