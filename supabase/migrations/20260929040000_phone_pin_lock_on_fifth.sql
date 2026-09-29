-- The Third Eye — start the lock on the fifth failed PIN, not on the sixth
-- attempt. Run in Supabase Dashboard → SQL Editor, after
-- 20260929010000_phone_pin_escalating_lock.sql. Safe to re-run.
--
-- THE DEFECT. phone_pin_attempt set locked_until only when an attempt arrived
-- with pin_tries already at the maximum — so the fifth wrong PIN left the account
-- unlocked and merely armed, and the lock began whenever somebody next tried.
--
-- That put the cost on the wrong person. An attacker spends five wrong guesses
-- and walks away; hours later the real owner types their CORRECT PIN, and that
-- attempt is the one refused, starting a fresh fifteen minutes (or six hours, once
-- the ladder has climbed) at exactly the moment they needed to get in. The clock
-- is supposed to punish the guessing, and it was punishing whoever came next.
--
-- So the fifth attempt is still allowed — the fifth PIN may well be the right
-- one — but the lock is written in the same statement that allows it. If that PIN
-- verifies, phone_pin_ok clears the lock, the counter and the ladder; if it does
-- not, the lock is already in place and dated from the guessing, not from the
-- next visitor.
--
-- The allowed-and-locked attempt returns its locked_until so the caller can say
-- "locked for N minutes" instead of "0 tries left", which is both accurate and
-- the more useful thing to read.
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

  IF v_tries + 1 >= p_max THEN
    v_mins := CASE
                WHEN v_count <= 0 THEN 15
                WHEN v_count = 1 THEN 60
                WHEN v_count = 2 THEN 360
                ELSE 1440
              END;
    v_locked := now() + make_interval(mins => v_mins);
    -- ALLOWED, and locked in the same breath. The counter resets because the lock
    -- is now what holds the gate; phone_pin_ok undoes all of it if this PIN is right.
    UPDATE public.phone_users
       SET pin_tries = 0,
           lock_count = least(v_count + 1, 3),
           locked_until = v_locked
     WHERE id = p_id;
    RETURN QUERY SELECT true, p_max, v_locked;
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

revoke execute on function public.phone_pin_attempt(uuid, int) from public, anon, authenticated;
