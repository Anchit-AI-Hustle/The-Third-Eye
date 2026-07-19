-- Job Agent schema. Follows the existing convention: user_id is the session
-- EMAIL (text), the app writes through the service-role server route, and RLS is
-- a backstop that scopes every user-owned row to auth.jwt()->>'email'.
-- Fully idempotent (create if not exists + drop/recreate policies) so
-- `supabase db push` is safe to re-run.

-- ── User-owned tables ────────────────────────────────────────────────────────
create table if not exists job_agent_profiles (
  id text primary key,
  user_id text not null,
  headline text,
  summary text,
  contact_json jsonb default '{}'::jsonb,
  links_json jsonb default '[]'::jsonb,
  work_authorization_json jsonb default '{}'::jsonb,
  availability_json jsonb default '{}'::jsonb,
  profile_json jsonb default '{}'::jsonb,
  profile_completeness int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists job_agent_profiles_user_uq on job_agent_profiles(user_id);

create table if not exists career_preferences (
  id text primary key,
  user_id text not null,
  target_roles jsonb default '[]'::jsonb,
  target_industries jsonb default '[]'::jsonb,
  locations jsonb default '[]'::jsonb,
  remote_preferences text,
  employment_types jsonb default '[]'::jsonb,
  salary_preferences_json jsonb default '{}'::jsonb,
  sponsorship_preferences text,
  exclusions_json jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists career_preferences_user_idx on career_preferences(user_id);

create table if not exists candidate_documents (
  id text primary key,
  user_id text not null,
  document_type text,
  storage_path text,
  original_filename text,
  mime_type text,
  checksum text,
  parser_status text default 'pending',
  parsed_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists candidate_documents_user_idx on candidate_documents(user_id);

create table if not exists candidate_facts (
  id text primary key,
  user_id text not null,
  profile_id text,
  fact_type text not null,
  value_json jsonb,
  original_text text,
  source_document_id text,
  source_locator_json jsonb,
  confidence real default 0.5,
  verified text default 'unverified',
  sensitivity text default 'normal',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists candidate_facts_user_idx on candidate_facts(user_id);
create index if not exists candidate_facts_type_idx on candidate_facts(user_id, fact_type);

create table if not exists saved_jobs (
  id text primary key,
  user_id text not null,
  job_id text not null,
  job_json jsonb,
  state text default 'saved', -- saved | dismissed
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists saved_jobs_user_job_uq on saved_jobs(user_id, job_id);

create table if not exists job_matches (
  id text primary key,
  user_id text not null,
  job_id text not null,
  score int,
  confidence real,
  eligibility text,
  breakdown_json jsonb,
  matched_fact_ids jsonb,
  missing_requirements jsonb,
  model_metadata_json jsonb,
  created_at timestamptz default now()
);
create index if not exists job_matches_user_idx on job_matches(user_id, job_id);

create table if not exists resume_documents (
  id text primary key,
  user_id text not null,
  name text,
  base_resume_id text,
  target_job_id text,
  application_id text,
  document_json jsonb not null,
  template_id text default 'classic-ats',
  version_number int default 1,
  is_master boolean default false,
  validation_json jsonb,
  generation_metadata_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists resume_documents_user_idx on resume_documents(user_id);

create table if not exists cover_letters (
  id text primary key,
  user_id text not null,
  target_job_id text,
  application_id text,
  title text,
  document_json jsonb not null,
  version_number int default 1,
  generation_metadata_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists cover_letters_user_idx on cover_letters(user_id);

create table if not exists answer_library (
  id text primary key,
  user_id text not null,
  category text,
  canonical_question text,
  approved_answer text,
  source_fact_ids jsonb,
  sensitivity text default 'normal',
  reuse_policy text default 'ask', -- auto | ask | never
  context_json jsonb,
  last_reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists answer_library_user_idx on answer_library(user_id);

create table if not exists applications (
  id text primary key,
  user_id text not null,
  job_id text not null,
  job_json jsonb,
  status text default 'preparing',
  match_id text,
  submitted_resume_id text,
  submitted_cover_letter_id text,
  submission_url text,
  source_confirmation text,
  match_score int,
  submitted_at timestamptz,
  follow_up_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- One live application per user + canonical job (unless explicitly reapplied).
create unique index if not exists applications_user_job_uq on applications(user_id, job_id);
create index if not exists applications_user_status_idx on applications(user_id, status);

create table if not exists application_answers (
  id text primary key,
  user_id text not null,
  application_id text not null,
  question text,
  answer text,
  source_fact_ids jsonb,
  confidence real,
  sensitive boolean default false,
  user_approved boolean default false,
  submitted boolean default false,
  created_at timestamptz default now()
);
create index if not exists application_answers_app_idx on application_answers(user_id, application_id);

create table if not exists application_events (
  id text primary key,
  user_id text not null,
  application_id text not null,
  event_type text,
  from_status text,
  to_status text,
  metadata_json jsonb,
  created_at timestamptz default now()
);
create index if not exists application_events_app_idx on application_events(user_id, application_id);

create table if not exists agent_runs (
  id text primary key,
  user_id text not null,
  run_type text,
  job_id text,
  application_id text,
  idempotency_key text,
  status text default 'queued',
  current_step text,
  input_hash text,
  prompt_version text,
  provider text,
  model text,
  token_usage_json jsonb,
  error_code text,
  safe_error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists agent_runs_idem_uq on agent_runs(user_id, idempotency_key);

create table if not exists job_agent_settings (
  id text primary key,
  user_id text not null,
  enabled_sources jsonb default '[]'::jsonb,
  application_policy_json jsonb default '{}'::jsonb,
  document_defaults_json jsonb default '{}'::jsonb,
  privacy_preferences_json jsonb default '{}'::jsonb,
  notification_preferences_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists job_agent_settings_user_uq on job_agent_settings(user_id);

create table if not exists job_agent_audit (
  id text primary key,
  user_id text not null,
  entity_type text,
  entity_id text,
  action text,
  metadata_json jsonb,
  created_at timestamptz default now()
);
create index if not exists job_agent_audit_user_idx on job_agent_audit(user_id);

-- ── Shared job cache (readable by any authenticated user; writes server-side) ──
create table if not exists jobs (
  id text primary key,
  canonical_url text,
  normalized_title text,
  normalized_company text,
  location_json jsonb,
  description_text text,
  sanitized_description_html text,
  employment_type text,
  seniority text,
  salary_json jsonb,
  remote_type text,
  published_at timestamptz,
  expires_at timestamptz,
  content_hash text,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now()
);
create unique index if not exists jobs_canonical_uq on jobs(canonical_url);

create table if not exists job_source_records (
  id text primary key,
  job_id text not null,
  source text,
  source_job_id text,
  source_url text,
  apply_url text,
  attribution text,
  raw_metadata_json jsonb,
  fetched_at timestamptz default now()
);
create unique index if not exists job_source_records_uq on job_source_records(source, source_job_id);

-- ── RLS: owner policy on user-owned tables ───────────────────────────────────
do $$
declare r record;
begin
  for r in
    select * from (values
      ('job_agent_profiles',  'ja users own profiles'),
      ('career_preferences',  'ja users own preferences'),
      ('candidate_documents', 'ja users own documents'),
      ('candidate_facts',     'ja users own facts'),
      ('saved_jobs',          'ja users own saved jobs'),
      ('job_matches',         'ja users own matches'),
      ('resume_documents',    'ja users own resumes'),
      ('cover_letters',       'ja users own cover letters'),
      ('answer_library',      'ja users own answers'),
      ('applications',        'ja users own applications'),
      ('application_answers', 'ja users own application answers'),
      ('application_events',  'ja users own application events'),
      ('agent_runs',          'ja users own agent runs'),
      ('job_agent_settings',  'ja users own settings'),
      ('job_agent_audit',     'ja users own audit')
    ) as x(tbl, pol)
  loop
    if to_regclass(r.tbl) is not null then
      execute format('alter table %I enable row level security', r.tbl);
      execute format('drop policy if exists %I on %I', r.pol, r.tbl);
      execute format(
        'create policy %I on %I for all using (auth.jwt() ->> ''email'' = user_id) with check (auth.jwt() ->> ''email'' = user_id)',
        r.pol, r.tbl);
    end if;
  end loop;
end $$;

-- Shared job cache: authenticated users may read; no direct anon writes.
do $$
begin
  if to_regclass('jobs') is not null then
    execute 'alter table jobs enable row level security';
    execute 'drop policy if exists "ja jobs readable" on jobs';
    execute 'create policy "ja jobs readable" on jobs for select using (auth.role() = ''authenticated'')';
  end if;
  if to_regclass('job_source_records') is not null then
    execute 'alter table job_source_records enable row level security';
    execute 'drop policy if exists "ja job sources readable" on job_source_records';
    execute 'create policy "ja job sources readable" on job_source_records for select using (auth.role() = ''authenticated'')';
  end if;
end $$;
