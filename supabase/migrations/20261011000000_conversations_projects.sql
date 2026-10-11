-- Assistant chat history and projects. One row per conversation (its messages
-- and model history as JSON) and per project (instructions plus attached files,
-- sent with every message in that project).
create table if not exists conversations (
  user_id text not null,
  id text not null,
  project_id text,
  title text not null default '',
  messages jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists conversations_user_updated on conversations (user_id, updated_at desc);

alter table conversations enable row level security;
drop policy if exists "users own conversations" on conversations;
create policy "users own conversations" on conversations for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);

create table if not exists projects (
  user_id text not null,
  id text not null,
  name text not null default '',
  instructions text not null default '',
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table projects enable row level security;
drop policy if exists "users own projects" on projects;
create policy "users own projects" on projects for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
