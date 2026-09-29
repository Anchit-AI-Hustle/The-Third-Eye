-- Set by whichever finalize() gets to store a daily track's audio, so two
-- overlapping calls (a webhook retry and the listing's fallback) can't
-- interleave writes to the same chunks. See lib/music/daily.ts.
alter table music_daily_tracks add column if not exists claimed_at timestamptz;
