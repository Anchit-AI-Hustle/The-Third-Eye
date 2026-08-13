-- Phase 0 of the always-on gateway: make a non-browser client possible, and
-- make the agent's brakes work for one.
--
-- Two problems this solves.
--
-- 1. Every API route authenticates with a NextAuth session cookie. A daemon has
--    no cookie, so there is currently no way for anything but a browser to talk
--    to the assistant. `gateway_tokens` gives a long-lived, revocable, scoped
--    bearer credential tied to one user.
--
-- 2. The kill switch and audit log live in localStorage (lib/agentControl.ts),
--    so they only bind the browser tab that owns them. A headless client would
--    bypass both — an always-on agent with no brakes and no record. Both move
--    server-side here, which also means the log survives clearing site data.

-- ── Gateway credentials ──────────────────────────────────────────────────────
create table if not exists public.gateway_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      text        not null,
  name         text        not null,
  -- Only the SHA-256 of the token is stored. A leaked database row cannot be
  -- replayed as a credential, and the plaintext is shown exactly once at mint.
  token_hash   text        not null unique,
  scopes       text[]      not null default '{}',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists gateway_tokens_user_idx on public.gateway_tokens (user_id);
-- Verification looks a token up by hash on every request, so that lookup is the
-- one that has to stay fast as tokens accumulate.
create index if not exists gateway_tokens_hash_idx on public.gateway_tokens (token_hash);

-- ── Kill switch ──────────────────────────────────────────────────────────────
create table if not exists public.agent_control (
  user_id    text primary key,
  killed     boolean     not null default false,
  updated_at timestamptz not null default now()
);

-- ── Audit trail ──────────────────────────────────────────────────────────────
-- Append-only by intent: the app never updates or deletes rows here, and
-- `source` records which client asked for the action so a gateway's writes are
-- distinguishable from the ones made at a keyboard.
create table if not exists public.agent_audit (
  id      uuid        primary key default gen_random_uuid(),
  user_id text        not null,
  ts      timestamptz not null default now(),
  type    text        not null,
  label   text        not null,
  outcome text        not null check (outcome in ('applied', 'blocked', 'failed')),
  source  text        not null default 'browser'
);

create index if not exists agent_audit_user_ts_idx on public.agent_audit (user_id, ts desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- The app reaches these tables through service-role server routes, which bypass
-- RLS. Enabling it with no policy denies the anon key outright, so the public
-- key shipped to every browser cannot read another user's tokens or history.
alter table public.gateway_tokens enable row level security;
alter table public.agent_control  enable row level security;
alter table public.agent_audit    enable row level security;
