-- Lock down search_path (prevents a malicious search_path from hijacking
-- unqualified references inside these functions) and remove the default
-- PUBLIC execute grant Postgres gives new functions — none of these are
-- called by the anon/authenticated client roles; the app only reaches them
-- via the service-role key, which bypasses grants entirely.

alter function public.increment_usage(p_user_id text, p_metric text, p_amount integer) set search_path = public;
alter function public.match_cortex_memories(p_user_id text, query_embedding vector(768), match_count int) set search_path = public;
alter function public.match_cortex_chunks(p_user_id text, query_embedding vector(768), match_count int) set search_path = public;

revoke execute on function public.increment_usage(p_user_id text, p_metric text, p_amount integer) from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
