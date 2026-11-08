-- Account-level settings and on-device app data (agent profiles, modes, wake
-- word, kill switch, skills, device-vault apps, drafts...), so every device a
-- person signs in on has the same. A null value means deleted.
create table if not exists user_prefs (
  user_id text not null,
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table user_prefs enable row level security;
drop policy if exists "users own user_prefs" on user_prefs;
create policy "users own user_prefs" on user_prefs for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
