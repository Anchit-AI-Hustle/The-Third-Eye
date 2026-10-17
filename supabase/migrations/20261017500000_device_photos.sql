-- Photos synced from the iPhone app's library (lib/deviceSync.ts): one row per
-- photo, keyed by the phone's asset id, with a small JPEG thumbnail.
create table if not exists device_photos (
  user_id text not null,
  id text not null,
  taken_at timestamptz not null,
  width integer not null default 0,
  height integer not null default 0,
  lat double precision,
  lon double precision,
  favorite boolean not null default false,
  thumb text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists device_photos_taken on device_photos (user_id, taken_at desc);

alter table device_photos enable row level security;
drop policy if exists "users own device photos" on device_photos;
create policy "users own device photos" on device_photos for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
