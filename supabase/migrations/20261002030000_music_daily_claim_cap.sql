-- Claim the next queued daily-drop user only while fewer than p_max claims are
-- live, as one serialized step. Counting and claiming separately let an extra
-- sweep or overlapping workers push the renders past the cap.
create or replace function music_daily_claim(p_day date, p_lease_ms int, p_max int)
returns text language plpgsql as $$
declare
  cutoff timestamptz := now() - make_interval(secs => p_lease_ms / 1000.0);
  claimed text;
begin
  perform pg_advisory_xact_lock(hashtext('music_daily_claim'));
  if (select count(*) from music_daily where queued_on = p_day and claimed_at >= cutoff) >= p_max then
    return null;
  end if;
  update music_daily set claimed_at = now()
   where user_id = (
     select user_id from music_daily
      where queued_on = p_day and (claimed_at is null or claimed_at < cutoff)
      order by claimed_at nulls first, user_id
      limit 1)
  returning user_id into claimed;
  return claimed;
end $$;
