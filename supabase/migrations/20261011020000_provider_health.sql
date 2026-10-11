-- Shared view of each AI provider's state, written by whichever server
-- instance last called it, so every instance skips a provider that is out of
-- quota or credit and uses the model that last worked. Server-only: RLS on,
-- no client policy.
create table if not exists provider_health (
  provider text primary key,
  status text not null default 'ok',
  model text,
  reason text,
  benched_until timestamptz,
  checked_at timestamptz not null default now()
);
alter table provider_health enable row level security;
