-- Per-conversation opt-in for tracker ingestion.
--
-- Problem this fixes: scrapeChatForUser() lists every Chat space the user belongs
-- to and ingests the first CHAT_MAX_SPACES of them. So connecting Google Chat
-- silently pulls tasks out of EVERY conversation — including social spaces and
-- whichever 15 spaces the API happened to return first. There was no way to say
-- "watch these two groups and nothing else".
--
-- This table is that allow-list. One row per conversation we've discovered, with
-- `included` defaulting to FALSE — connecting an account now discovers chats but
-- ingests none until the user picks. It also caches the human label and deep link
-- so tasks.source_detail / tasks.source_link can name the originating chat without
-- a second API round-trip at extraction time.
--
-- Run in Supabase Dashboard → SQL Editor. Service-role only (no client policy).
-- Safe to re-run.

create table if not exists public.conversation_sources (
  user_id         text not null,          -- the signed-in user's email
  connector       text not null,          -- ConnectorId from lib/connectors.ts
  conversation_id text not null,          -- 'spaces/AAAA', Slack channel id, Telegram chat id
  label           text,                   -- human name → tasks.source_detail
  link            text,                   -- deep link → tasks.source_link
  is_group        boolean not null default false,
  included        boolean not null default false,  -- opt-in, never opt-out
  discovered_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, connector, conversation_id)
);

-- The ingest hot path: "which conversations am I watching for this connector?"
create index if not exists conversation_sources_included_idx
  on public.conversation_sources (user_id, connector) where included;

alter table public.conversation_sources enable row level security;
