-- The daily drop's work queue (lib/music/daily.ts). A user is queued for the
-- day; a bounded set of workers each claim one at a time. A claim is a lease,
-- so a worker that dies mid-render leaves its user to the next free worker
-- instead of stranding them.
alter table music_daily add column if not exists queued_on date;
alter table music_daily add column if not exists claimed_at timestamptz;
create index if not exists music_daily_queue on music_daily (queued_on) where queued_on is not null;
