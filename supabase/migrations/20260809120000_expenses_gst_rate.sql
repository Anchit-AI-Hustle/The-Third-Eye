-- Track the GST component of an expense: the % of GST already baked into the
-- (tax-inclusive) `amount`. Nullable — existing rows and untracked spend stay NULL.
alter table public.expenses add column if not exists gst_rate numeric;
