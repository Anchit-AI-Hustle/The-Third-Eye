-- MCP servers a user connects from the Connectors page. The token (sent as a
-- bearer header) is encrypted by the app server; the URL can carry a key too
-- (Zapier-style), so the server never returns it in full.
create table if not exists user_connectors (
  user_id text not null,
  id text not null,
  name text not null,
  url text not null,
  token_enc text,
  enabled boolean not null default true,
  tool_count integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table user_connectors enable row level security;
drop policy if exists "users own user_connectors" on user_connectors;
create policy "users own user_connectors" on user_connectors for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
