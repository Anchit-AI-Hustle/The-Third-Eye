-- JARVIS OS — own-data-layer: source connectors landing tables.
-- Pulls data IN from Shopify/Klaviyo/WebEngage into your own Supabase so all
-- features run on data you own. Run in Supabase SQL Editor. Idempotent.

-- Encrypted per-user credentials for each connected source.
create table if not exists integration_credentials (
  user_id         text not null,
  provider        text not null,          -- 'shopify' | 'klaviyo' | 'webengage'
  credentials_enc text not null,          -- AES-256-GCM (lib/crypto) blob
  meta            jsonb,                   -- non-secret metadata (shop domain, region)
  updated_at      timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table integration_credentials enable row level security; -- service-role only

-- Incremental-sync cursors (per user/provider/resource).
create table if not exists sync_state (
  user_id    text not null,
  provider   text not null,
  resource   text not null,               -- 'orders' | 'customers' | 'products' | ...
  cursor     text,                         -- last updated_at (ISO) or page cursor
  last_run   timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, resource)
);
alter table sync_state enable row level security;

-- ── Shopify raw landing tables (key columns + full raw jsonb) ──
create table if not exists shopify_orders (
  user_id           text not null,
  id                text not null,
  order_number      bigint,
  email             text,
  total_price       numeric,
  currency          text,
  financial_status  text,
  fulfillment_status text,
  created_at        timestamptz,
  updated_at        timestamptz,
  raw               jsonb not null,
  primary key (user_id, id)
);
create index if not exists shopify_orders_user_updated_idx on shopify_orders(user_id, updated_at desc);

create table if not exists shopify_customers (
  user_id      text not null,
  id           text not null,
  email        text,
  first_name   text,
  last_name    text,
  orders_count int,
  total_spent  numeric,
  created_at   timestamptz,
  updated_at   timestamptz,
  raw          jsonb not null,
  primary key (user_id, id)
);
create index if not exists shopify_customers_user_email_idx on shopify_customers(user_id, email);

create table if not exists shopify_products (
  user_id      text not null,
  id           text not null,
  title        text,
  status       text,
  vendor       text,
  product_type text,
  created_at   timestamptz,
  updated_at   timestamptz,
  raw          jsonb not null,
  primary key (user_id, id)
);
create index if not exists shopify_products_user_updated_idx on shopify_products(user_id, updated_at desc);

alter table shopify_orders    enable row level security;
alter table shopify_customers enable row level security;
alter table shopify_products  enable row level security;
