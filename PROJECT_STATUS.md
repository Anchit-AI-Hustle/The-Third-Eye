# The Third Eye — Project Status

**Live product:** Next.js 14 + Supabase on Vercel (`frontend/`). See
[DEVELOPMENT.md](DEVELOPMENT.md) for what's actually shipped and running.

This file used to track `backend/`'s internal phase checklist (Phase
1–2 "complete", Phase 3 "in progress") as if it were the product roadmap.
It wasn't accurate: `backend/` is a separately-developed FastAPI + agents +
RAG service that is well-tested internally but **was never deployed**, and
the live app doesn't call it (see [AUDIT.md](AUDIT.md), finding F-01, still
open as of this writing). The sections below reflect actual state.

---

## What's live today (`frontend/`)

- Tool-calling assistant (`/api/chat`) with ~25 tools, 4 personas, streaming
  SSE, confirm-then-act on sensitive actions.
- Tasks, notes, goals, knowledge-base RAG (pgvector), calendar/email
  (opt-in Google connect), reminders, multi-agent reasoning.
- Live Capture (continuous speech transcription → auto-created tasks) and
  Vision (screen/webcam → Gemini multimodal).
- Studio generators (Landing Page, HTML Mailer, Lifecycle OS, Creative
  Studio, **Music Studio**) plus an App Hub of 24 self-built tools + 76
  linked third-party apps.
- Mode-aware runtime (Personal / Professional / Enterprise), billing
  (Stripe checkout/portal/webhook), agent safety layer (kill switch +
  append-only audit log at `/activity`).
- MCP client (`lib/mcp/client.ts`) for external tool integration.

Full detail: [DEVELOPMENT.md](DEVELOPMENT.md).

## `backend/` status (not deployed)

FastAPI + SQLAlchemy async agent framework, 100%-covered internally:
agent registry/orchestrator with delegation, Research/Knowledge/Productivity
agents, a document ingestion → chunk → embed → retrieve pipeline, nightly
memory consolidation. All real, all tested — but it has no hosting target
(no `fly.toml`/`railway.json`/`render.yaml`, no second Vercel project), and
the one integration point in the frontend (`lib/api.ts`, `auth.ts`'s
`BACKEND_URL` POST) is imported nowhere and fails silently. See
[ARCHITECTURE.md](ARCHITECTURE.md) for its design and ADRs.

**Decision (2026-08-22, AUDIT.md F-01):** deploy it, on a genuinely free
stack — code changes done and tested, deploy itself not yet run (needs
`gcloud` auth this environment doesn't have, plus two free third-party
signups only you can complete).

The original plan (Cloud SQL + Memorystore + a warm Cloud Run instance) was
real, ongoing paid infrastructure regardless of traffic. Replaced with:

- **Postgres — reuse the existing Supabase project**, in its own dedicated
  schema (`db_schema` setting, default `"public"`, defaults to no behavior
  change) so its tables can't collide with the frontend's own `public`
  schema/RLS. `app/bootstrap_schema.py` creates the schema before Alembic
  runs (Alembic manages tables inside a schema, not the schema itself). No
  second database, no new cost.
- **Redis — [Upstash](https://upstash.com)**, genuinely free tier (no card
  required at signup), used as a drop-in `REDIS_URL`.
- **Compute — Cloud Run, scale-to-zero** (no minimum instances). Free within
  Google's standing always-free quota (2M requests, ~180K vCPU-seconds,
  ~360K GiB-seconds/month) — comfortably enough for single-user traffic. The
  honest caveat: this is "free within the free tier," not "incapable of ever
  billing" if usage grows well past personal-project levels.
- **Scheduling — GitHub Actions cron**, not the in-process APScheduler job.
  Scale-to-zero means the process usually isn't running at 2am UTC, so an
  in-process scheduler can't be relied on. `.github/workflows/backend-
  consolidation-cron.yml` (already in this repo, no-ops safely until secrets
  are set) hits a new protected endpoint, `POST /internal/run-consolidation`
  with an `X-Cron-Secret` header, which wakes the instance and runs the job
  for real. Disabled by default (`INTERNAL_CRON_SECRET` unset ⇒ the route
  404s rather than existing at all).

**What's left, and who does it:**
1. *(you)* Create a free Upstash Redis database, copy its `REDIS_URL`.
2. *(you)* `gcloud auth login` + `gcloud config set project jarvis-anchit`
   locally, or grant this environment gcloud access — deploying from here
   isn't possible without one of those (no CLI, no stored credentials).
3. *(either)* `gcloud run deploy jarvis-backend --source backend/ --region
   <your region> --allow-unauthenticated --set-env-vars
   DB_SCHEMA=backend_app,ENVIRONMENT=production,...` with `DATABASE_URL`
   (Supabase connection string), `REDIS_URL` (from step 1), and the other
   required secrets (`SECRET_KEY`, `FINANCIAL_ENCRYPTION_KEY`,
   `NEXTAUTH_SECRET`, `GOOGLE_AI_API_KEY`, and a new random
   `INTERNAL_CRON_SECRET`) set via `--set-secrets` or the Cloud Run console,
   never committed to the repo.
4. *(you)* Add `BACKEND_URL` (the Cloud Run service URL) and
   `BACKEND_CRON_SECRET` (same value as `INTERNAL_CRON_SECRET`) as GitHub
   repo secrets, so the cron workflow starts firing.
5. Verify: `curl https://<service-url>/health` returns `{"status":
   "healthy", ...}` and `/api/docs` loads — that's Definition-of-Live
   criteria #3 satisfied.

Standing it up alone (this plan) is deliberately separate from any later
decision to actually cut the frontend over to calling it (AUDIT.md §4.4
option B) — that's a second, larger step, not part of this one.

## Recent security review (2026-08-19)

Ran a GCP project security review (`jarvis-anchit`) via `gcloud`: IAM clean
(single owner), no Compute/Storage/Cloud SQL/Cloud Run resources, Security
Command Center Standard tier enabled (free), Recommender API enabled
(free). Found two live Gemini API keys (`Gemini API Key`, `gemini-third-eye`)
both scoped to `generativelanguage.googleapis.com` only, with neither an
application restriction nor a way (via gcloud, Vercel CLI, or GitHub) to
determine which one is actually set in Vercel's `GEMINI_API_KEY`/
`GOOGLE_API_KEY` env var from this environment — that determination needs a
one-time manual check in the Vercel dashboard before the unused key can be
safely deleted.

## Known documentation drift (from AUDIT.md, not yet resolved)

- F-02: **fixed 2026-08-19.** The 5 Supabase migration files that sat in
  `frontend/supabase/migrations/` (RLS hardening, `conversation_sources`,
  the `tasks` ingestion columns, `music_tracks`, `job_agent`) are now in
  `supabase/migrations/` where `supabase db push`/CI actually reads from.
  This was the confirmed root cause of Gmail/Chat task-tracker ingestion
  silently producing nothing in production: `saveExtractedTasks` writes
  columns (`dedupe_hash`, `normalized_heading`, etc.) that only existed in
  the stranded migration, so every ingest insert failed; Chat ingestion
  additionally needs the `conversation_sources` table for its opt-in
  picker, which never existed live either. Takes effect once this change
  merges to `main` and the `supabase-deploy` workflow runs.
- F-04: 2 high-severity Next.js CVEs; fix needs a Next 14→16 major bump
  (Dependabot ignores majors — F-10).
- 8 loose `supabase-schema-*.sql` files at repo root are a third,
  unreconciled schema path (superseded by `supabase/migrations/`).

Full findings table: [AUDIT.md](AUDIT.md).

---

*Last updated: 2026-08-19.*
