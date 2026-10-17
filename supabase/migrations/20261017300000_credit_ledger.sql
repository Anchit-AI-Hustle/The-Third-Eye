-- Server-side credits, one wallet per account. Creations spend credits here
-- before they run; the sign-up gift is granted once, when the wallet is first
-- opened. credit_ledger is append-only. RLS on with no policies and execute
-- revoked from anon/authenticated keeps both server-only.
create table if not exists public.credit_wallets (
  user_id text primary key,
  balance integer not null check (balance >= 0),
  created_at timestamptz not null default now()
);
alter table public.credit_wallets enable row level security;

create table if not exists public.credit_ledger (
  id bigserial primary key,
  user_id text not null,
  delta integer not null,
  reason text not null,
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_created on public.credit_ledger (user_id, created_at desc);
alter table public.credit_ledger enable row level security;

create or replace function public.credit_balance(p_user_id text, p_gift integer)
returns integer
language plpgsql
set search_path = public
as $$
DECLARE
  v_balance integer;
BEGIN
  INSERT INTO credit_wallets (user_id, balance) VALUES (p_user_id, p_gift)
  ON CONFLICT (user_id) DO NOTHING;
  IF FOUND THEN
    INSERT INTO credit_ledger (user_id, delta, reason, balance_after)
    VALUES (p_user_id, p_gift, 'Sign-up gift', p_gift);
  END IF;
  SELECT balance INTO v_balance FROM credit_wallets WHERE user_id = p_user_id;
  RETURN v_balance;
END;
$$;

-- Returns the new balance, or -1 (nothing spent) when the balance is short.
create or replace function public.spend_credits(p_user_id text, p_amount integer, p_reason text, p_gift integer)
returns integer
language plpgsql
set search_path = public
as $$
DECLARE
  v_balance integer;
BEGIN
  PERFORM credit_balance(p_user_id, p_gift);
  UPDATE credit_wallets SET balance = balance - p_amount
   WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN
    RETURN -1;
  END IF;
  INSERT INTO credit_ledger (user_id, delta, reason, balance_after)
  VALUES (p_user_id, -p_amount, p_reason, v_balance);
  RETURN v_balance;
END;
$$;

-- Gives credits back (a creation that failed after it was charged).
create or replace function public.refund_credits(p_user_id text, p_amount integer, p_reason text)
returns integer
language plpgsql
set search_path = public
as $$
DECLARE
  v_balance integer;
BEGIN
  UPDATE credit_wallets SET balance = balance + p_amount
   WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN
    RETURN -1;
  END IF;
  INSERT INTO credit_ledger (user_id, delta, reason, balance_after)
  VALUES (p_user_id, p_amount, p_reason, v_balance);
  RETURN v_balance;
END;
$$;

revoke all on table public.credit_wallets, public.credit_ledger from anon, authenticated;
revoke execute on function public.credit_balance(text, integer) from public, anon, authenticated;
revoke execute on function public.spend_credits(text, integer, text, integer) from public, anon, authenticated;
revoke execute on function public.refund_credits(text, integer, text) from public, anon, authenticated;
