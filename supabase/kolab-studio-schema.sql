-- Kolab Studio (/kolab/studio, embedded from github.com/Anchit-AI-Hustle/Kolab) — full schema.
-- Paste into a DEDICATED Kolab Supabase project (Supabase → SQL Editor → Run) — do NOT run this
-- against The Third Eye's own project. Combines all of Kolab's migrations in order; kept in sync
-- by hand with supabase/schema.sql in the Kolab repo (source of truth for future changes).
--
-- After creating the project, set NEXT_PUBLIC_KOLAB_SUPABASE_URL / NEXT_PUBLIC_KOLAB_SUPABASE_ANON_KEY
-- / KOLAB_SUPABASE_SERVICE_ROLE_KEY in .env (see .env.example) — see also
-- frontend/src/lib/kolab-studio/env.ts.


-- ============================================================
-- supabase/migrations/0001_init.sql
-- ============================================================

-- Kolab — Phase 1 schema + Row-Level Security.
-- Implements docs/DATA-MODEL.md. Every table has RLS enabled with DEFAULT-DENY; policies scope
-- rows to auth.uid(). Entitlement columns (profiles.privileged, profiles.role) and the
-- server-authoritative tables (kyc_verifications, subscriptions, audit_log) are NOT writable by
-- the `authenticated` role — only the service-role key (which bypasses RLS) may set them. This is
-- how "never trust the client for KYC / subscription / privilege" (SECURITY.md §3, CLAUDE.md #2,#4)
-- is enforced in the database itself.

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type role_t         as enum ('creator','brand','admin');
  create type kyc_status_t    as enum ('pending','verified','failed');
  create type plan_t          as enum ('basic','pro','brand_starter','brand_growth','brand_scale');
  create type cycle_t         as enum ('monthly','annual','complimentary');
  create type sub_status_t    as enum ('active','past_due','canceled');
  create type platform_t      as enum ('instagram','youtube','facebook','tiktok','google');
  create type asset_type_t    as enum ('video','carousel','photo','loop');
  create type plan_status_t   as enum ('to_shoot','shot','edited','scheduled','posted');
  create type publish_status_t as enum ('queued','publishing','published','failed');
  create type consent_type_t  as enum ('kyc','channel_access','marketing','tos');
exception when duplicate_object then null; end $$;

-- ---------- shared updated_at trigger ----------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============================================================
-- profiles (1–1 with auth.users)
-- ============================================================
create table if not exists profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  name          text,
  handle        text unique,
  dob           date,
  avatar_path   text,
  pincode       text,
  country       text,
  state         text,
  city          text,
  address_enc   text,          -- app-level encrypted (SECURITY §5); never plaintext
  website_url   text,
  influencer_bio text,
  is_complete   boolean not null default false,
  privileged    boolean not null default false,  -- server-set only
  role          role_t  not null default 'creator', -- server-set only
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;
create policy "profiles: read own"   on profiles for select using (auth.uid() = user_id);
create policy "profiles: insert own" on profiles for insert with check (auth.uid() = user_id);
create policy "profiles: update own" on profiles for update using (auth.uid() = user_id);

-- Column privileges: the `authenticated` role may read/write only non-privilege fields.
-- privileged + role are intentionally excluded, so a signed-in user can never elevate themselves.
revoke all on profiles from authenticated;
grant select on profiles to authenticated;
grant insert (user_id, name, handle, dob, avatar_path, pincode, country, state, city,
              website_url, influencer_bio, is_complete, created_at, updated_at)
  on profiles to authenticated;
grant update (name, handle, dob, avatar_path, pincode, country, state, city,
              website_url, influencer_bio, is_complete, updated_at)
  on profiles to authenticated;

-- ============================================================
-- kyc_verifications (1–1) — server-authoritative; no client writes
-- ============================================================
create table if not exists kyc_verifications (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  status                kyc_status_t not null default 'pending',
  provider              text,
  provider_reference_id text,
  aadhaar_last4         text,      -- display only; NEVER the full number/biometrics
  consent_artifact_id   text,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger kyc_updated before update on kyc_verifications
  for each row execute function set_updated_at();

alter table kyc_verifications enable row level security;
-- Read own status only. No insert/update policy => authenticated cannot forge KYC state.
create policy "kyc: read own" on kyc_verifications for select using (auth.uid() = user_id);

-- ============================================================
-- subscriptions (1–1) — set by billing webhook (service role) only
-- ============================================================
create table if not exists subscriptions (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  plan                     plan_t,
  cycle                    cycle_t,
  status                   sub_status_t,
  razorpay_subscription_id text,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger subs_updated before update on subscriptions
  for each row execute function set_updated_at();

alter table subscriptions enable row level security;
create policy "subs: read own" on subscriptions for select using (auth.uid() = user_id);
-- No insert/update policy => authenticated cannot self-activate a plan (webhook is source of truth).

-- ============================================================
-- channels (1–*) — oauth tokens stored encrypted, written server-side (Phase 3)
-- ============================================================
create table if not exists channels (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  platform       platform_t not null,
  handle         text,
  oauth_token_enc text,       -- encrypted; not selectable by client (column grant below)
  connected      boolean not null default false,
  scopes         text[],
  linked_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, platform)
);
create trigger channels_updated before update on channels
  for each row execute function set_updated_at();

alter table channels enable row level security;
create policy "channels: rw own" on channels for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on channels from authenticated;
grant select (id, user_id, platform, handle, connected, scopes, linked_at, created_at, updated_at)
  on channels to authenticated;   -- note: oauth_token_enc is NOT selectable by the client
grant insert (id, user_id, platform, handle, connected, scopes, linked_at) on channels to authenticated;
grant update (handle, connected, scopes, linked_at, updated_at) on channels to authenticated;
grant delete on channels to authenticated;

-- ============================================================
-- content_pillars / content_plan / scheduled_posts / deals (1–*) — full owner CRUD
-- ============================================================
create table if not exists content_pillars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text,
  role       text,
  sort_order int not null default 0,  -- not "order": reserved word in SQL and PostgREST
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pillars_updated before update on content_pillars
  for each row execute function set_updated_at();
alter table content_pillars enable row level security;
create policy "pillars: rw own" on content_pillars for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists content_plan (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  day_index  int,
  date       date,
  pillar_id  uuid references content_pillars(id) on delete set null,
  format     text,
  asset_type asset_type_t,
  time       text,
  hook       text,
  caption    text,
  frames     jsonb,
  status     plan_status_t not null default 'to_shoot',
  done       boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plan_updated before update on content_plan
  for each row execute function set_updated_at();
alter table content_plan enable row level security;
create policy "plan: rw own" on content_plan for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists scheduled_posts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text,
  scheduled_at     timestamptz,
  channels         platform_t[],
  content_plan_id  uuid references content_plan(id) on delete set null,
  publish_status   publish_status_t not null default 'queued',
  provider_post_ids jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger posts_updated before update on scheduled_posts
  for each row execute function set_updated_at();
alter table scheduled_posts enable row level security;
create policy "posts: rw own" on scheduled_posts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists deals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  brand        text,
  emoji        text,
  product      text,
  category     text,
  code         text,
  discount     text,
  price        text,
  affiliate_url text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger deals_updated before update on deals
  for each row execute function set_updated_at();
alter table deals enable row level security;
create policy "deals: rw own" on deals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- consents (1–*) — user may record + read own; server also writes
-- ============================================================
create table if not exists consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       consent_type_t not null,
  granted    boolean not null default true,
  artifact   text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger consents_updated before update on consents
  for each row execute function set_updated_at();
alter table consents enable row level security;
create policy "consents: read own"   on consents for select using (auth.uid() = user_id);
create policy "consents: insert own" on consents for insert with check (auth.uid() = user_id);

-- ============================================================
-- audit_log (append-only) — service role only; no client access at all
-- ============================================================
create table if not exists audit_log (
  id        uuid primary key default gen_random_uuid(),
  actor_id  uuid,
  action    text not null,
  entity    text,
  entity_id text,
  ip        text,
  ua        text,
  meta      jsonb not null default '{}'::jsonb,  -- no PII/secrets
  at        timestamptz not null default now()
);
alter table audit_log enable row level security;
-- No policies => authenticated has no access. The service-role key (server) inserts; it bypasses RLS.
-- Append-only: no update/delete granted to anyone but the service role.

-- ============================================================
-- supabase/migrations/0002_pillars_sort_order.sql
-- ============================================================

-- Forward migration: ensure content_pillars uses `sort_order` (not the reserved word "order").
-- Fresh installs already get `sort_order` from 0001. This idempotently repairs any environment
-- that applied an earlier 0001 which created an `order` column, so the Studio code that
-- selects/inserts/orders by `sort_order` won't hit a missing-column error after deploy.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_pillars' and column_name = 'order'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_pillars' and column_name = 'sort_order'
  ) then
    alter table public.content_pillars rename column "order" to sort_order;
  end if;
end $$;

-- ============================================================
-- supabase/migrations/0003_org_tenancy.sql
-- ============================================================

-- Kolab Phase 0 — multi-tenant foundation (organizations, memberships, invites).
-- Per PROMPT.md §2, §3, §12: an ORG owns the account type + billing; users belong to orgs via
-- memberships. RLS is keyed to MEMBERSHIP (via is_org_member / has_org_role), never to auth.uid().
--
-- This migration is ADDITIVE: it introduces the tenancy layer without changing the existing
-- creator tables' user-scoped RLS. A follow-up migration adds org_id to those domain tables and
-- re-keys their policies to membership (spec §12.2, §12.6).

create extension if not exists pgcrypto;

do $$ begin
  create type org_type_t    as enum ('creator','commerce','local','agency');
  create type member_role_t as enum ('owner','admin','member','viewer');
exception when duplicate_object then null; end $$;

-- ---------- organizations ----------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        org_type_t not null,
  vertical    text,                       -- sub-category (footwear, QSR, café…); seeds defaults only, never gates
  created_by  uuid not null references auth.users(id) on delete set null,
  -- billing lives on the org (spec §9); webhook/service-role is the source of truth
  plan        text,
  cycle       text,
  status      text,
  razorpay_subscription_id text,
  seats       int not null default 1,
  current_period_end timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger organizations_updated before update on organizations
  for each row execute function set_updated_at();

-- ---------- memberships ----------
create table if not exists memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       member_role_t not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create trigger memberships_updated before update on memberships
  for each row execute function set_updated_at();
create index if not exists memberships_user_idx on memberships(user_id);
create index if not exists memberships_org_idx on memberships(org_id);

-- ---------- org_invites ----------
create table if not exists org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  email      text not null,
  role       member_role_t not null default 'member',
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger org_invites_updated before update on org_invites
  for each row execute function set_updated_at();
create index if not exists org_invites_org_idx on org_invites(org_id);

-- ---------- membership helpers (SECURITY DEFINER: bypass RLS to avoid policy recursion) ----------
create or replace function is_org_member(target_org uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function has_org_role(target_org uuid, allowed member_role_t[])
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org and m.user_id = auth.uid() and m.role = any(allowed)
  );
$$;

revoke all on function is_org_member(uuid) from public;
revoke all on function has_org_role(uuid, member_role_t[]) from public;
grant execute on function is_org_member(uuid) to authenticated, service_role;
grant execute on function has_org_role(uuid, member_role_t[]) to authenticated, service_role;

-- ---------- RLS ----------
alter table organizations enable row level security;
-- Any authenticated user may create an org (they become its owner via a membership row).
create policy "orgs: create" on organizations for insert
  with check (auth.uid() = created_by);
create policy "orgs: read if member" on organizations for select
  using (is_org_member(id));
create policy "orgs: update if owner/admin" on organizations for update
  using (has_org_role(id, array['owner','admin']::member_role_t[]));

alter table memberships enable row level security;
-- See your own membership rows, and (for org admins) all rows in your orgs.
create policy "memberships: read own" on memberships for select
  using (user_id = auth.uid() or is_org_member(org_id));
-- Owners/admins manage the roster; a user may also insert their OWN owner row when creating an org.
create policy "memberships: owner insert self" on memberships for insert
  with check (user_id = auth.uid() or has_org_role(org_id, array['owner','admin']::member_role_t[]));
create policy "memberships: admin update" on memberships for update
  using (has_org_role(org_id, array['owner','admin']::member_role_t[]));
create policy "memberships: admin delete" on memberships for delete
  using (has_org_role(org_id, array['owner','admin']::member_role_t[]));

alter table org_invites enable row level security;
create policy "invites: read if member" on org_invites for select
  using (is_org_member(org_id));
create policy "invites: admin manage" on org_invites for all
  using (has_org_role(org_id, array['owner','admin']::member_role_t[]))
  with check (has_org_role(org_id, array['owner','admin']::member_role_t[]));

-- ============================================================
-- supabase/migrations/0004_fix_membership_insert_policy.sql
-- ============================================================

-- Security fix (tenant isolation) + bootstrap correctness for memberships.
--
-- Problems in the 0003 policies:
--  (1) "memberships: owner insert self" let ANY authenticated user insert a self 'owner' membership
--      into ANY org (WITH CHECK passed on user_id = auth.uid() alone) → cross-tenant escalation.
--  (2) The creator can't see their just-created org under a membership-only SELECT policy, so the
--      INSERT ... RETURNING in /api/org/create and the created_by check both fail at bootstrap.
--
-- Fix: allow a self 'owner' insert ONLY when the user created the org AND the org has no members
-- yet (the true bootstrap — the first-ever membership). This also stops a creator who was later
-- REMOVED from the roster from re-inserting themselves as owner: once any membership exists, only
-- owners/admins may add rows. Both checks use SECURITY DEFINER helpers so they are evaluated
-- independently of the caller's RLS visibility (a non-member must not be able to "see zero members"
-- and thereby satisfy the bootstrap condition).

create or replace function is_org_creator(target_org uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from organizations o where o.id = target_org and o.created_by = auth.uid()
  );
$$;

create or replace function org_has_members(target_org uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = target_org);
$$;

revoke all on function is_org_creator(uuid) from public;
revoke all on function org_has_members(uuid) from public;
grant execute on function is_org_creator(uuid) to authenticated, service_role;
grant execute on function org_has_members(uuid) to authenticated, service_role;

-- Let a member read the org; the creator may read it ONLY during bootstrap (before any member
-- exists), which is what the INSERT ... RETURNING in /api/org/create needs. Scoping the creator
-- exception to `not org_has_members(id)` keeps a later-removed creator from reading the org forever
-- (once the owner membership is inserted, the creator reads via is_org_member instead).
drop policy if exists "orgs: read if member" on organizations;
create policy "orgs: read if member or bootstrap creator" on organizations for select
  using (is_org_member(id) or (created_by = auth.uid() and not org_has_members(id)));

-- Owners/admins manage the roster; a creator may insert ONLY the bootstrap owner row.
drop policy if exists "memberships: owner insert self" on memberships;
create policy "memberships: insert" on memberships for insert
  with check (
    has_org_role(org_id, array['owner','admin']::member_role_t[])
    or (
      user_id = auth.uid()
      and role = 'owner'
      and is_org_creator(org_id)
      and not org_has_members(org_id)  -- bootstrap only; blocks removed creators from reclaiming
    )
  );
