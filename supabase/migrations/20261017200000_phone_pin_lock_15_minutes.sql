-- The Third Eye: phone + 4-digit PIN is now the only way in, and the lockout is
-- the one every project uses: 5 wrong tries, then 15 minutes. Safe to re-run.
--
-- Replaces the escalating ladder from 20260929010000 (15 min, 1 h, 6 h, 24 h).
-- What stays: the try is claimed under a row lock BEFORE any hashing, so a burst
-- of parallel guesses cannot get past five, and the fifth attempt writes the lock
-- in the same statement that allows it (see 20260929040000), so the clock runs
-- from the guessing and not from whoever comes next. phone_pin_ok still clears
-- the count and the lock on a right PIN. lock_count is left in place, unused.
create or replace function public.phone_pin_attempt(p_id uuid, p_max int)
returns table (allowed boolean, tries int, locked_until timestamptz)
language plpgsql
as $$
DECLARE
  v_tries int;
  v_locked timestamptz;
BEGIN
  SELECT pu.pin_tries, pu.locked_until
    INTO v_tries, v_locked
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

  IF v_tries + 1 >= p_max THEN
    v_locked := now() + interval '15 minutes';
    UPDATE public.phone_users
       SET pin_tries = 0,
           locked_until = v_locked
     WHERE id = p_id;
    RETURN QUERY SELECT true, p_max, v_locked;
    RETURN;
  END IF;

  UPDATE public.phone_users
     SET pin_tries = v_tries + 1,
         locked_until = NULL
   WHERE id = p_id;
  RETURN QUERY SELECT true, v_tries + 1, NULL::timestamptz;
END;
$$;

revoke execute on function public.phone_pin_attempt(uuid, int) from public, anon, authenticated;
