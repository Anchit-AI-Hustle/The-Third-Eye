-- Kolab Studio (/kolab/studio), moved off its own Supabase project onto this database.
--
-- Its tables live in their own `kolab` schema: `profiles` and `subscriptions` already exist in
-- `public` with different shapes. Ported from the Supabase version with two changes:
--   • user ids are the app's sign-in identity (`session.user.email`, the E.164 number under
--     phone sign-in) as text, not auth.users uuids — Kolab no longer has its own sign-in;
--   • no RLS policies or column grants. They keyed on auth.uid() and the `authenticated` role,
--     neither of which exists here: the server connects as the owner, and every query scopes by
--     user_id / membership itself (lib/kolab-studio/*). The server-only columns (privileged,
--     role, KYC, subscription state) are only ever written by server code paths.

create schema if not exists kolab;

do $$ begin
  create type kolab.role_t           as enum ('creator','brand','admin');
  create type kolab.kyc_status_t     as enum ('pending','verified','failed');
  create type kolab.plan_t           as enum ('basic','pro','brand_starter','brand_growth','brand_scale');
  create type kolab.cycle_t          as enum ('monthly','annual','complimentary');
  create type kolab.sub_status_t     as enum ('active','past_due','canceled');
  create type kolab.platform_t       as enum ('instagram','youtube','facebook','tiktok','google');
  create type kolab.asset_type_t     as enum ('video','carousel','photo','loop');
  create type kolab.plan_status_t    as enum ('to_shoot','shot','edited','scheduled','posted');
  create type kolab.publish_status_t as enum ('queued','publishing','published','failed');
  create type kolab.consent_type_t   as enum ('kyc','channel_access','marketing','tos');
  create type kolab.org_type_t       as enum ('creator','commerce','local','agency');
  create type kolab.member_role_t    as enum ('owner','admin','member','viewer');
exception when duplicate_object then null; end $$;

create or replace function kolab.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table if not exists kolab.profiles (
  user_id        text primary key,
  name           text,
  handle         text unique,
  dob            date,
  avatar_path    text,
  pincode        text,
  country        text,
  state          text,
  city           text,
  address_enc    text,
  website_url    text,
  influencer_bio text,
  is_complete    boolean not null default false,
  privileged     boolean not null default false,
  role           kolab.role_t not null default 'creator',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists kolab.kyc_verifications (
  user_id               text primary key,
  status                kolab.kyc_status_t not null default 'pending',
  provider              text,
  provider_reference_id text,
  aadhaar_last4         text,
  consent_artifact_id   text,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists kolab.subscriptions (
  user_id                  text primary key,
  plan                     kolab.plan_t,
  cycle                    kolab.cycle_t,
  status                   kolab.sub_status_t,
  razorpay_subscription_id text,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists kolab.channels (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  platform        kolab.platform_t not null,
  handle          text,
  oauth_token_enc text,
  connected       boolean not null default false,
  scopes          text[],
  linked_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, platform)
);

create table if not exists kolab.content_pillars (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  name       text not null,
  color      text,
  role       text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_pillars_user_idx on kolab.content_pillars (user_id);

create table if not exists kolab.content_plan (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  day_index  int,
  date       date,
  pillar_id  uuid references kolab.content_pillars(id) on delete set null,
  format     text,
  asset_type kolab.asset_type_t,
  time       text,
  hook       text,
  caption    text,
  frames     jsonb,
  status     kolab.plan_status_t not null default 'to_shoot',
  done       boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_plan_user_idx on kolab.content_plan (user_id);

create table if not exists kolab.scheduled_posts (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,
  title             text,
  scheduled_at      timestamptz,
  channels          text[],  -- platform_t values; text[] because pg returns enum arrays unparsed
  content_plan_id   uuid references kolab.content_plan(id) on delete set null,
  publish_status    kolab.publish_status_t not null default 'queued',
  provider_post_ids jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists scheduled_posts_user_idx on kolab.scheduled_posts (user_id);

create table if not exists kolab.deals (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  brand         text,
  emoji         text,
  product       text,
  category      text,
  code          text,
  discount      text,
  price         text,
  affiliate_url text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists deals_user_idx on kolab.deals (user_id);

create table if not exists kolab.consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  type       kolab.consent_type_t not null,
  granted    boolean not null default true,
  artifact   text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only: nothing in the app updates or deletes it.
create table if not exists kolab.audit_log (
  id        uuid primary key default gen_random_uuid(),
  actor_id  text,
  action    text not null,
  entity    text,
  entity_id text,
  ip        text,
  ua        text,
  meta      jsonb not null default '{}'::jsonb,
  at        timestamptz not null default now()
);

create table if not exists kolab.organizations (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  type                     kolab.org_type_t not null,
  vertical                 text,
  created_by               text,
  plan                     text,
  cycle                    text,
  status                   text,
  razorpay_subscription_id text,
  seats                    int not null default 1,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists kolab.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references kolab.organizations(id) on delete cascade,
  user_id    text not null,
  role       kolab.member_role_t not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on kolab.memberships (user_id);

create table if not exists kolab.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references kolab.organizations(id) on delete cascade,
  email       text not null,
  role        kolab.member_role_t not null default 'member',
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  text,
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists org_invites_org_idx on kolab.org_invites (org_id);

do $$
declare t text;
begin
  foreach t in array array['profiles','kyc_verifications','subscriptions','channels','content_pillars',
                           'content_plan','scheduled_posts','deals','consents','organizations',
                           'memberships','org_invites'] loop
    execute format('drop trigger if exists %I on kolab.%I', t || '_updated', t);
    execute format('create trigger %I before update on kolab.%I for each row execute function kolab.set_updated_at()',
                   t || '_updated', t);
  end loop;
end $$;
