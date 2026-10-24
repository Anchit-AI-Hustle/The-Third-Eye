-- Credit packs bought with Razorpay (India, INR). One row per Razorpay order,
-- written when the order is created; grant_razorpay_purchase marks it paid and
-- credits the wallet in one step, at most once per order and per payment id.
-- Server-only, like the credit ledger.
create table if not exists public.razorpay_purchases (
  order_id text primary key,
  user_id text not null,
  pack text not null,
  credits integer not null check (credits > 0),
  amount_paise integer not null check (amount_paise >= 100),
  status text not null default 'created' check (status in ('created', 'paid')),
  payment_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists razorpay_purchases_user on public.razorpay_purchases (user_id, created_at desc);
alter table public.razorpay_purchases enable row level security;

-- Returns the new balance, or -1 when the order was already credited (or is unknown).
create or replace function public.grant_razorpay_purchase(p_order_id text, p_payment_id text, p_reason text, p_gift integer)
returns integer
language plpgsql
set search_path = public
as $$
DECLARE
  v_user text;
  v_credits integer;
  v_balance integer;
BEGIN
  UPDATE razorpay_purchases SET status = 'paid', payment_id = p_payment_id, paid_at = now()
   WHERE order_id = p_order_id AND status = 'created'
  RETURNING user_id, credits INTO v_user, v_credits;
  IF v_user IS NULL THEN
    RETURN -1;
  END IF;
  PERFORM credit_balance(v_user, p_gift);
  UPDATE credit_wallets SET balance = balance + v_credits
   WHERE user_id = v_user
  RETURNING balance INTO v_balance;
  INSERT INTO credit_ledger (user_id, delta, reason, balance_after)
  VALUES (v_user, v_credits, p_reason, v_balance);
  RETURN v_balance;
END;
$$;

revoke all on table public.razorpay_purchases from anon, authenticated;
revoke execute on function public.grant_razorpay_purchase(text, text, text, integer) from public, anon, authenticated;
