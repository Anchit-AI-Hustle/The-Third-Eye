-- Encrypted GitHub OAuth token per user. The app server is the table owner
-- and is the only reader; RLS stays on with no client policy, same as google_tokens.
create table if not exists public.github_tokens (
  user_id text primary key,
  access_token_enc text not null,
  login text,
  updated_at timestamptz not null default now()
);
alter table public.github_tokens enable row level security;
