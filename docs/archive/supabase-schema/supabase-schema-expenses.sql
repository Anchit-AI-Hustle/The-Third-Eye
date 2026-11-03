-- The Third Eye — Expense tracker.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run (IF NOT EXISTS).
create table if not exists expenses (
  id         text primary key,
  user_id    text not null,
  amount     numeric not null default 0,      -- in the user's currency (INR)
  category   text not null default 'Other',
  note       text,
  spent_on   text not null,                   -- YYYY-MM-DD
  created_at timestamptz not null default now()
);
create index if not exists expenses_user_id_idx on expenses(user_id);
create index if not exists expenses_user_spent_idx on expenses(user_id, spent_on);
alter table expenses enable row level security;
-- Direct-from-browser access is via the service role in /api/data; this policy
-- only matters if a JWT-bridged client is ever added.
create policy "users own expenses" on expenses for all using (auth.jwt() ->> 'email' = user_id);
