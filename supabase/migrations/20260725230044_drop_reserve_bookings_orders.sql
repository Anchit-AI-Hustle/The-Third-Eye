-- JARVIS OS — drop unused reserve/bookings/orders tables.
-- Recreated locally to match the migration already applied to the remote project
-- (version 20260725230044). Without this file the Supabase migration check fails
-- with "Remote migration versions not found in local migrations directory".

drop table if exists orders cascade;
drop table if exists bookings cascade;
