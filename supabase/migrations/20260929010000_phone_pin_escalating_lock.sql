-- The Third Eye — make the 4-digit PIN actually survive an unattended attacker.
-- Run in Supabase Dashboard → SQL Editor, after
-- 20260929000000_phone_pin_lockout_atomic.sql. Safe to re-run.
--
-- A CORRECTION FIRST. The previous migration and lib/phonePin.ts both claimed
-- that five tries per fifteen minutes put a sweep of all ten thousand PINs "out
-- of reach by years". That was wrong, and wrong in the direction that matters:
--
--   24h / 15min = 96 windows/day × 5 tries = 480 guesses/day
--   10,000 / 480 = ~21 days to exhaust; ~10 days for an even chance
--
-- Three weeks of a script nobody is watching, not years. A fixed lock does not
-- defend a four-digit secret, because the attacker's total budget grows linearly
-- with time and the space is small enough for time to cover it.
--
-- TWO CHANGES FIX THAT.
--
-- 1. THE LOCK ESCALATES. Consecutive lockouts lengthen: 15 minutes, then 1 hour,
--    then 6, then 24 and 24 thereafter. Once an attacker is four lockouts deep
--    they get 5 guesses a day, so the space takes thousands of days rather than
--    twenty — and the ladder resets the moment the real person signs in, so
--    somebody who mistypes their own PIN twice in a month never meets the top of
--    it. It also resets if 24 hours pass after a lock expires without further
--    failures, so an old bad patch is not inherited for ever.
--
--    This does not make a denial of service worse than it already was: an
--    attacker who could re-lock an account every fifteen minutes could already
--    keep it shut indefinitely.
--
-- 2. A TRY IS SPENT BEFORE THE PIN IS CHECKED, NOT AFTER. The counter was
--    already atomic, but the attempts still READ the lock, all verified, and only
--    then incremented — so a burst of concurrent requests could test as many
--    candidates as the rate limiter allowed inside one unlocked window instead of
--    five. phone_pin_attempt now takes the row lock, tests the lock and spends
--    the try in one statement, BEFORE any hashing, and returns whether the caller
--    may proceed. Overlapping attempts serialise on that row, so five means five.
--
-- What this still does not fix: nothing proves possession of the number, and a
-- 6-digit PIN would be a million values rather than ten thousand. Both are the
-- owner's calls, recorded on PR #315.

alter table public.phone_users add column if not exists lock_count int not null default 0;

-- Superseded by phone_pin_attempt, which has to run BEFORE the hash rather than
-- after the verify. Dropped so nothing can keep calling the weaker shape.
drop function if exists public.phone_pin_fail(uuid, int, int);

create or replace function public.phone_pin_attempt(p_id uuid, p_max int)
returns table (allowed boolean, tries int, locked_until timestamptz)
language plpgsql
as $$
DECLARE
  v_tries int;
  v_locked timestamptz;
  v_count int;
  v_mins int;
BEGIN
  -- FOR UPDATE is the whole point: overlapping attempts on one account queue
  -- here, so they cannot all pass the check below and all spend a guess.
  SELECT pu.pin_tries, pu.locked_until, pu.lock_count
    INTO v_tries, v_locked, v_count
    FROM public.phone_users pu
   WHERE pu.id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    RETURN QUERY SELECT false, 0, v_locked;
    RETURN;
  END IF;

  -- A quiet day after a lock expired clears the ladder, so a real person who had
  -- a bad afternoon last month does not start at twenty-four hours.
  IF v_locked IS NOT NULL AND v_locked < now() - interval '24 hours' THEN
    v_count := 0;
  END IF;

  IF v_tries + 1 > p_max THEN
    v_mins := CASE
                WHEN v_count <= 0 THEN 15
                WHEN v_count = 1 THEN 60
                WHEN v_count = 2 THEN 360
                ELSE 1440
              END;
    v_locked := now() + make_interval(mins => v_mins);
    UPDATE public.phone_users
       SET pin_tries = 0,
           lock_count = least(v_count + 1, 3),
           locked_until = v_locked
     WHERE id = p_id;
    RETURN QUERY SELECT false, 0, v_locked;
    RETURN;
  END IF;

  UPDATE public.phone_users
     SET pin_tries = v_tries + 1,
         lock_count = v_count,
         locked_until = NULL
   WHERE id = p_id;
  RETURN QUERY SELECT true, v_tries + 1, NULL::timestamptz;
END;
$$;

-- The right PIN clears everything: the count, the ladder and the lock. Without
-- this, escalation would be permanent for anyone who ever locked themselves out.
create or replace function public.phone_pin_ok(p_id uuid)
returns void
language sql
as $$
  update public.phone_users
     set pin_tries = 0,
         lock_count = 0,
         locked_until = null,
         last_seen_at = now()
   where id = p_id;
$$;

-- Service-role server routes only. EXECUTE is granted to PUBLIC by default and
-- the anon key is in every browser, so without this anyone could clear their own
-- lock (phone_pin_ok) or burn somebody else's tries (phone_pin_attempt).
revoke execute on function public.phone_pin_attempt(uuid, int) from public, anon, authenticated;
revoke execute on function public.phone_pin_ok(uuid) from public, anon, authenticated;
