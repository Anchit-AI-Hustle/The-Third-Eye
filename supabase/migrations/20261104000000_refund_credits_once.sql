-- Idempotent async-job refunds: unique (user_id, reason) for job refund rows,
-- plus an atomic RPC so concurrent polls cannot double-credit.

create unique index if not exists credit_ledger_job_refund_once
  on public.credit_ledger (user_id, reason)
  where reason like 'Refund: % job %';

create or replace function public.refund_credits_once(p_user_id text, p_amount integer, p_reason text)
returns integer
language plpgsql
set search_path = public
as $$
DECLARE
  v_balance integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM credit_ledger WHERE user_id = p_user_id AND reason = p_reason LIMIT 1
  ) THEN
    RETURN -2;
  END IF;

  UPDATE credit_wallets SET balance = balance + p_amount
   WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN
    RETURN -1;
  END IF;

  BEGIN
    INSERT INTO credit_ledger (user_id, delta, reason, balance_after)
    VALUES (p_user_id, p_amount, p_reason, v_balance);
  EXCEPTION WHEN unique_violation THEN
    UPDATE credit_wallets SET balance = balance - p_amount
     WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;
    RETURN -2;
  END;

  RETURN v_balance;
END;
$$;

revoke execute on function public.refund_credits_once(text, integer, text) from public, anon, authenticated;
