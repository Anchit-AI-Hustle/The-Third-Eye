-- The Third Eye — phone number + 4-digit PIN sign-in.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run (IF NOT EXISTS).
--
-- Ported from parwah-hq, which signs a family in on a number and a PIN because
-- an SMS provider was never going to arrive in time. Google sign-in is
-- commented out in frontend/src/lib/auth.ts; Google stays reachable as a
-- CONNECTION (Settings → Connections), which is what Gmail and Calendar
-- actually depend on, so keeping it out of the login path costs no feature.
--
-- The identity every other table keys on is this table's `phone` (E.164), used
-- wherever a Google email used to sit — see lib/serverIdentity.ts. It is an
-- opaque string to the rest of the app, so nothing else has to change.

create table if not exists public.phone_users (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  phone_cc text,
  phone_local text,
  name text not null,
  -- scrypt, per lib/phonePin.ts. Only the derived key is stored, never the PIN.
  pin_hash text,
  pin_salt text,
  pin_set_at timestamptz,
  -- Four digits is ten thousand possibilities, so the lockout is the real
  -- defence: five wrong tries shuts the account for fifteen minutes. Counted
  -- here rather than per-IP because a household shares one connection.
  pin_tries int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists phone_users_phone on public.phone_users (phone);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Reached only through the service-role server route (app/api/auth/phone and
-- the NextAuth credentials provider), which bypasses RLS. Enabling it with no
-- policy denies the anon key outright, so the public key shipped to every
-- browser cannot read a PIN hash or enumerate who has an account.
alter table public.phone_users enable row level security;
