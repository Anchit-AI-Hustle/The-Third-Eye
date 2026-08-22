-- One-time cleanup: applying migrations directly via the Supabase MCP tool
-- (instead of through `supabase db push` reading the already-committed local
-- files) recorded them under a fresh timestamp rather than the local
-- filenames' original one, leaving duplicate rows with no local file
-- counterpart in supabase_migrations.schema_migrations. The underlying
-- schema changes were already correctly tracked under the matching
-- historical version below each one, so this only drops the duplicate
-- bookkeeping rows — it does not undo any schema change. Idempotent: safe to
-- re-run (deletes nothing if the rows are already gone).

delete from supabase_migrations.schema_migrations
where version in (
  '20260819033826', -- duplicate of 20260719000000_rls_hardening
  '20260819033940', -- duplicate of 20260719120000_music_tracks
  '20260819034031', -- duplicate of 20260720000000_job_agent
  '20260819034152', -- duplicate of 20260720120000_tasks_ingestion_columns
  '20260819034239'  -- duplicate of 20260729000000_conversation_sources
);
