-- Every output a feature makes (Studio assets, landing pages, music, videos,
-- book chapters, job kits, chat-made assets), kept in the account so the
-- Generations page shows them on every device, not only the browser that made them.
create table if not exists generations (
  user_id text not null,
  id text not null,
  app text not null default '',
  tool text,
  app_label text not null default '',
  title text not null default '',
  kind text not null default 'text',
  inputs jsonb not null default '[]'::jsonb,
  input_text text,
  output text not null default '',
  meta jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists generations_user_created on generations (user_id, created_at desc);

alter table generations enable row level security;
drop policy if exists "users own generations" on generations;
create policy "users own generations" on generations for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
