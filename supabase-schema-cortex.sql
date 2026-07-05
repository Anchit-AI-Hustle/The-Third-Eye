-- JARVIS OS — Cortex: native memory & knowledge engine (pgvector)
-- Ports the Python backend's memory/ + knowledge/ RAG into the live app.
-- Run after the earlier schema files. Embeddings are Gemini text-embedding-004 (768-dim).

create extension if not exists vector;

-- Semantic + episodic memory. Each interaction/fact is embedded for recall.
create table if not exists cortex_memories (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  kind text not null default 'episodic',   -- 'episodic' | 'semantic'
  content text not null,
  embedding vector(768),
  importance real not null default 0.5,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);
create index if not exists cortex_memories_user_idx on cortex_memories(user_id);
create index if not exists cortex_memories_vec_idx on cortex_memories
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
alter table cortex_memories enable row level security;
create policy "users own cortex memories" on cortex_memories for all using (auth.jwt() ->> 'email' = user_id);

-- Document chunks for RAG. Content lives in knowledge_docs; chunks are embedded here.
create table if not exists cortex_doc_chunks (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  doc_id text not null,
  doc_title text not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);
create index if not exists cortex_doc_chunks_user_idx on cortex_doc_chunks(user_id);
create index if not exists cortex_doc_chunks_doc_idx on cortex_doc_chunks(doc_id);
create index if not exists cortex_doc_chunks_vec_idx on cortex_doc_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
alter table cortex_doc_chunks enable row level security;
create policy "users own cortex chunks" on cortex_doc_chunks for all using (auth.jwt() ->> 'email' = user_id);

-- Cosine-similarity search over memories, scoped to a user.
create or replace function match_cortex_memories(
  p_user_id text, query_embedding vector(768), match_count int default 5
)
returns table (id text, content text, kind text, similarity real)
language sql stable as $$
  select m.id, m.content, m.kind, 1 - (m.embedding <=> query_embedding) as similarity
  from cortex_memories m
  where m.user_id = p_user_id and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- Cosine-similarity search over document chunks, scoped to a user.
create or replace function match_cortex_chunks(
  p_user_id text, query_embedding vector(768), match_count int default 5
)
returns table (id text, doc_id text, doc_title text, chunk_index int, content text, similarity real)
language sql stable as $$
  select c.id, c.doc_id, c.doc_title, c.chunk_index, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from cortex_doc_chunks c
  where c.user_id = p_user_id and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
