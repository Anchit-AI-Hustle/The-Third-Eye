-- JARVIS OS — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor

-- Tasks
create table if not exists tasks (
  id text primary key,
  user_id text not null,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'medium',
  due_date text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_id_idx on tasks(user_id);
alter table tasks enable row level security;
create policy "users own tasks" on tasks for all using (auth.jwt() ->> 'email' = user_id);

-- Team members (linked to tasks)
create table if not exists team_members (
  id text primary key,
  user_id text not null,
  task_id text references tasks(id) on delete cascade,
  name text not null,
  role text,
  avatar_url text,
  created_at timestamptz not null default now()
);
create index if not exists team_members_user_id_idx on team_members(user_id);
create index if not exists team_members_task_id_idx on team_members(task_id);
alter table team_members enable row level security;
create policy "users own team_members" on team_members for all using (auth.jwt() ->> 'email' = user_id);

-- Notes
create table if not exists notes (
  id text primary key,
  user_id text not null,
  title text not null,
  content text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_id_idx on notes(user_id);
alter table notes enable row level security;
create policy "users own notes" on notes for all using (auth.jwt() ->> 'email' = user_id);

-- Goals
create table if not exists goals (
  id text primary key,
  user_id text not null,
  title text not null,
  description text,
  category text not null default 'Personal',
  target numeric not null default 100,
  current numeric not null default 0,
  unit text not null default '%',
  deadline text,
  created_at timestamptz not null default now()
);
create index if not exists goals_user_id_idx on goals(user_id);
alter table goals enable row level security;
create policy "users own goals" on goals for all using (auth.jwt() ->> 'email' = user_id);

-- Knowledge docs
create table if not exists knowledge_docs (
  id text primary key,
  user_id text not null,
  title text not null,
  content text not null default '',
  file_type text not null default 'txt',
  file_size_bytes bigint not null default 0,
  chunk_count integer not null default 0,
  processing_status text not null default 'ready',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_docs_user_id_idx on knowledge_docs(user_id);
alter table knowledge_docs enable row level security;
create policy "users own knowledge_docs" on knowledge_docs for all using (auth.jwt() ->> 'email' = user_id);

-- Enable realtime for all tables
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table team_members;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table knowledge_docs;

-- Persistent memory (key-value facts JARVIS learns about the user)
create table if not exists jarvis_memory (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, key)
);
create index if not exists jarvis_memory_user_id_idx on jarvis_memory(user_id);
alter table jarvis_memory enable row level security;
create policy "users own memory" on jarvis_memory for all using (auth.jwt() ->> 'email' = user_id);
