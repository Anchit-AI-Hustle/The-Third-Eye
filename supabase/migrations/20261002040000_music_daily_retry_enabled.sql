-- A failed daily render is redone only when Replicate plainly refused it (it
-- answered 4xx, so nothing was created or charged). A timeout or dropped
-- connection may have been accepted after all, and redoing it would pay twice
-- and orphan the first render's webhook.
alter table music_daily_tracks add column if not exists retryable boolean not null default false;

-- Claims skip users who switched the daily drop off after being queued.
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
      where queued_on = p_day and enabled and (claimed_at is null or claimed_at < cutoff)
      order by claimed_at nulls first, user_id
      limit 1)
  returning user_id into claimed;
  return claimed;
end $$;
