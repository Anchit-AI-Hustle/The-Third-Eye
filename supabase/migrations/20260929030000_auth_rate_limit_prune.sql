-- The Third Eye — stop the sign-in rate limiter growing without bound.
-- Run in Supabase Dashboard → SQL Editor, after
-- 20260929000000_phone_pin_lockout_atomic.sql. Safe to re-run.
--
-- THE DEFECT. auth_rate_limit inserts one row per (bucket, key) and nothing ever
-- removed them. The per-number bucket is keyed on the phone number from the
-- request body, and /api/auth/phone is unauthenticated, so a caller cycling
-- through numbers inserted a permanent row on every single request. The caller
-- limit could not save the table either: it was checked second, so every request
-- had already written its number bucket by the time the caller was refused — and
-- a forged X-Forwarded-For (see clientIp) means the caller bucket can be grown the
-- same way regardless of order.
--
-- A limiter whose own bookkeeping is the denial-of-service is not a limiter, so
-- the rows now expire. Pruning happens inside the same function rather than in a
-- cron, because a deployment nobody is running a scheduler against is exactly
-- where this bites, and it is sampled (1 call in 100) so a sweep is not paid for
-- on every sign-in.
--
-- A day is far longer than the longest window in use (600s), so nothing live is
-- ever deleted; the row is simply gone before the next attempt, which starts a
-- fresh window anyway.
create index if not exists auth_rate_limit_window on public.auth_rate_limit (window_start);

create or replace function public.auth_rate_limit_hit(
  p_bucket text,
  p_key text,
  p_window_secs int
) returns int
language plpgsql
as $$
DECLARE
  v_n int;
BEGIN
  IF random() < 0.01 THEN
    DELETE FROM public.auth_rate_limit WHERE window_start < now() - interval '1 day';
  END IF;

  INSERT INTO public.auth_rate_limit AS rl (bucket, k, window_start, n)
  VALUES (p_bucket, p_key, now(), 1)
  ON CONFLICT (bucket, k) DO UPDATE SET
    n = CASE WHEN rl.window_start < now() - make_interval(secs => p_window_secs)
             THEN 1 ELSE rl.n + 1 END,
    window_start = CASE WHEN rl.window_start < now() - make_interval(secs => p_window_secs)
                        THEN now() ELSE rl.window_start END
  RETURNING rl.n INTO v_n;

  RETURN v_n;
END;
$$;

-- The rewritten function needs the grant revoked again: CREATE OR REPLACE keeps
-- existing grants, but a signature that ever differs would come back with EXECUTE
-- granted to PUBLIC, and the anon key is in every browser.
revoke execute on function public.auth_rate_limit_hit(text, text, int) from public, anon, authenticated;
