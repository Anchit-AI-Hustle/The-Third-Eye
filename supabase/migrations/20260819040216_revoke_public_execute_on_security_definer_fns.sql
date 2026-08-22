-- The previous revoke targeted anon/authenticated directly, but Postgres grants
-- EXECUTE to PUBLIC by default on function creation, and both roles inherit
-- through that pseudo-role rather than an explicit grant. Revoke from PUBLIC.
revoke execute on function public.increment_usage(p_user_id text, p_metric text, p_amount integer) from public;
revoke execute on function public.rls_auto_enable() from public;
