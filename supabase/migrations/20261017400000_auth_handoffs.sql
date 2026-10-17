-- Sign-in handoff for home-screen apps (lib/authHandoff.ts): the app's random
-- code is stored only as a SHA-256 hash, approved once by the signed-in
-- person in Safari and claimed once by the app, within ten minutes. RLS on
-- with no policies keeps the table server-only.
create table if not exists public.auth_handoffs (
  id text primary key,
  email text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  claimed_at timestamptz
);
alter table public.auth_handoffs enable row level security;
revoke all on table public.auth_handoffs from anon, authenticated;
