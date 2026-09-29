-- The Third Eye — make the phone/PIN lockout and rate limit hold under
-- concurrency. Run in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- WHY THIS EXISTS. The lockout is the whole defence for a 4-digit PIN: the PIN
-- is one of ten thousand, and five tries per fifteen minutes is what turns a
-- sweep of all of them from minutes into years. Counting the tries in
-- application code broke that, and broke it silently. Every concurrent attempt
-- read the same pin_tries, added one to it, and wrote the same absolute value
-- back, so N guesses in parallel advanced the counter by one. The lock never
-- arrived, and the guesses available per window were bounded by the attacker's
-- concurrency rather than by five.
--
-- Incrementing, testing and locking therefore happen in ONE statement, where
-- the row lock the UPDATE takes serialises them.
--
-- `tries` comes back as the value AFTER the update, and a locked_until in the
-- future is how the caller knows this attempt is the one that locked it. On the
-- p_max-th consecutive failure the counter resets and the lock is set, so the
-- next window starts clean — the same shape the application code had, now
-- indivisible.
create or replace function public.phone_pin_fail(
  p_id uuid,
  p_max int,
  p_lock_minutes int
) returns table (tries int, locked_until timestamptz)
language sql
as $$
  update public.phone_users u
     set pin_tries = case when u.pin_tries + 1 >= p_max then 0 else u.pin_tries + 1 end,
         locked_until = case when u.pin_tries + 1 >= p_max
                             then now() + make_interval(mins => p_lock_minutes)
                             else u.locked_until end
   where u.id = p_id
  returning u.pin_tries, u.locked_until;
$$;

-- ── the rate limiter ────────────────────────────────────────────────────────
-- A fixed window counted in the database, so it holds across every serverless
-- instance — an in-process counter on Vercel counts one lambda's traffic and
-- misses the rest. Ported from parwah-hq's rate_limit table.
--
-- This is what stands in front of the unauthenticated sign-in path. Without it
-- anyone can spend the deployment's CPU on scrypt at will, walk a list of
-- numbers to see which are registered, and re-lock an account every fifteen
-- minutes for as long as they care to.
create table if not exists public.auth_rate_limit (
  bucket text not null,
  k text not null,
  window_start timestamptz not null default now(),
  n int not null default 1,
  primary key (bucket, k)
);

create or replace function public.auth_rate_limit_hit(
  p_bucket text,
  p_key text,
  p_window_secs int
) returns int
language sql
as $$
  insert into public.auth_rate_limit as rl (bucket, k, window_start, n)
  values (p_bucket, p_key, now(), 1)
  on conflict (bucket, k) do update set
    n = case when rl.window_start < now() - make_interval(secs => p_window_secs)
             then 1 else rl.n + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_secs)
                        then now() else rl.window_start end
  returning rl.n;
$$;

-- ── who may run these ───────────────────────────────────────────────────────
-- Only the service-role server routes. EXECUTE is granted to PUBLIC by default,
-- and the anon key is shipped to every browser, so leaving that in place would
-- hand anyone a way to lock any account or reset a rate-limit window. Same
-- reasoning as 20260819040216_revoke_public_execute_on_security_definer_fns.sql
-- applied to the functions that existed then.
revoke execute on function public.phone_pin_fail(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_hit(text, text, int) from public, anon, authenticated;

alter table public.auth_rate_limit enable row level security;
