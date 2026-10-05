-- Tables and functions the later migrations alter. Supabase Preview applies
-- only this directory, on an empty database. The base objects used to live in
-- the supabase-schema*.sql files, which Preview never runs, so the first
-- migration died with: relation "tasks" does not exist.
--
-- Every statement is skipped when the object already exists. Production
-- already has the real tables and function bodies (migrate.mjs applies the
-- schema files first); this must not replace them.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.tasks (
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
alter table public.tasks enable row level security;

create table if not exists public.expenses (
  id text primary key,
  user_id text not null,
  amount numeric not null default 0,
  category text not null default 'Other',
  note text,
  spent_on text not null,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;

create table if not exists public.google_tokens (
  user_id text primary key,
  refresh_token_enc text not null,
  scope text,
  updated_at timestamptz not null default now()
);
alter table public.google_tokens enable row level security;

create table if not exists public.usage_counters (
  user_id text not null,
  metric text not null,
  day date not null default current_date,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, day)
);
alter table public.usage_counters enable row level security;

create table if not exists public.knowledge_docs (
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
alter table public.knowledge_docs enable row level security;

create table if not exists public.cortex_memories (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  kind text not null default 'episodic',
  content text not null,
  embedding vector(768),
  importance real not null default 0.5,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);
alter table public.cortex_memories enable row level security;

create table if not exists public.cortex_doc_chunks (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  doc_id text not null references public.knowledge_docs(id) on delete cascade,
  doc_title text not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);
alter table public.cortex_doc_chunks enable row level security;

-- Created only when missing, so an existing body (the one in
-- supabase-schema-billing.sql / supabase-schema-cortex.sql) is left as it is.
do $$
begin
  if to_regprocedure('public.increment_usage(text, text, integer)') is null then
    execute $fn$
      create function public.increment_usage(p_user_id text, p_metric text, p_amount integer default 1)
      returns integer language plpgsql security definer as $body$
      declare new_count integer;
      begin
        insert into public.usage_counters (user_id, metric, day, count, updated_at)
        values (p_user_id, p_metric, current_date, p_amount, now())
        on conflict (user_id, metric, day)
        do update set count = usage_counters.count + p_amount, updated_at = now()
        returning count into new_count;
        return new_count;
      end;
      $body$
    $fn$;
  end if;

  if to_regprocedure('public.match_cortex_memories(text, vector, integer)') is null then
    execute $fn$
      create function public.match_cortex_memories(p_user_id text, query_embedding vector(768), match_count int default 5)
      returns table (id text, content text, kind text, similarity real)
      language sql stable as $body$
        select m.id, m.content, m.kind, 1 - (m.embedding <=> query_embedding) as similarity
        from public.cortex_memories m
        where m.user_id = p_user_id and m.embedding is not null
        order by m.embedding <=> query_embedding
        limit match_count
      $body$
    $fn$;
  end if;

  if to_regprocedure('public.match_cortex_chunks(text, vector, integer)') is null then
    execute $fn$
      create function public.match_cortex_chunks(p_user_id text, query_embedding vector(768), match_count int default 5)
      returns table (id text, doc_id text, doc_title text, chunk_index int, content text, similarity real)
      language sql stable as $body$
        select c.id, c.doc_id, c.doc_title, c.chunk_index, c.content,
               1 - (c.embedding <=> query_embedding) as similarity
        from public.cortex_doc_chunks c
        where c.user_id = p_user_id and c.embedding is not null
        order by c.embedding <=> query_embedding
        limit match_count
      $body$
    $fn$;
  end if;

  if to_regprocedure('public.rls_auto_enable()') is null then
    execute 'create function public.rls_auto_enable() returns void language sql as ''''';
  end if;
end $$;
