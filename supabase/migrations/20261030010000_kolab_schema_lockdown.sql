-- The kolab tables have no RLS (the server connects as the owner and scopes every
-- query itself), so the Data API roles must not be able to reach the schema at all.
revoke all on schema kolab from public, anon, authenticated;
revoke all on all tables in schema kolab from public, anon, authenticated;
revoke all on all sequences in schema kolab from public, anon, authenticated;
revoke all on all functions in schema kolab from public, anon, authenticated;
alter default privileges in schema kolab revoke all on tables from public, anon, authenticated;
alter default privileges in schema kolab revoke all on functions from public, anon, authenticated;
