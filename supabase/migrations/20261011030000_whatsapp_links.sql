-- A user's WhatsApp number, linked by sending a one-time code to JARVIS's
-- WhatsApp number. Holds the per-user gateway token the webhook uses to act as
-- them, the short chat history, and a pending confirm-before-act action.
create table if not exists whatsapp_links (
  user_id text primary key,
  phone text unique,
  link_code text,
  code_expires_at timestamptz,
  gateway_token_enc text,
  history jsonb not null default '[]'::jsonb,
  pending jsonb,
  notify boolean not null default true,
  last_inbound_at timestamptz,
  linked_at timestamptz
);
alter table whatsapp_links enable row level security;
