-- A user's own AI provider keys (and their Ollama URL), used for their
-- requests ahead of the deployment's shared keys. Values are encrypted with
-- TOKEN_ENCRYPTION_KEY in the app; RLS on with no policies keeps them
-- server-only.
create table if not exists user_provider_keys (
  user_id text not null,
  provider text not null,
  key_enc text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table user_provider_keys enable row level security;
