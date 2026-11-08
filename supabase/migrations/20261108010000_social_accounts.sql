-- Each person's own connected social accounts (Facebook Pages, Instagram,
-- Threads, X, LinkedIn, Reddit). Tokens are encrypted by the app
-- (lib/crypto, TOKEN_ENCRYPTION_KEY) before they are stored.
create table if not exists social_accounts (
  user_id text not null,
  platform text not null,
  account_id text not null,
  name text not null default '',
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, platform, account_id)
);

alter table social_accounts enable row level security;
drop policy if exists "users own social_accounts" on social_accounts;
create policy "users own social_accounts" on social_accounts for all
  using (auth.jwt() ->> 'email' = user_id)
  with check (auth.jwt() ->> 'email' = user_id);
