# The Third Eye — Project Status

**Live product:** Next.js 16 + Supabase on Vercel (`frontend/`). See
[DEVELOPMENT.md](DEVELOPMENT.md) for what's actually shipped and running.

This file used to track `backend/`'s internal phase checklist (Phase
1–2 "complete", Phase 3 "in progress") as if it were the product roadmap.
It wasn't accurate: `backend/` is a separately-developed FastAPI + agents +
RAG service that is well-tested internally but **was never deployed**, and
the live app doesn't call it (see [AUDIT.md](AUDIT.md), finding F-01:
decided 2026-08-22 to deploy on a free stack, deploy not yet run). The sections below reflect actual state.

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
nothing in the frontend calls it (the old `lib/api.ts` and `auth.ts`'s
`BACKEND_URL` POST were removed; the unused `/api/backend` rewrite was
removed from `next.config.js`). See
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

**Progress 2026-11-04:** Cloud Run Admin API enabled on `jarvis-anchit`;
`jarvis-backend` service created in `asia-south1` with embedded Redis in the
image (no Upstash required for a single scale-to-zero instance). Startup still
fails: the `DATABASE_URL` available locally points at the wrong pooler region
(`ap-south-1` vs project `ap-northeast-1`) and its password is rejected.
SSL/`statement_cache_size` handling for Supabase pooler is in `database.py`.

**What's left (you — one-time):**
1. In Supabase → Project Settings → Database, copy the **URI** (session
   pooler, region `ap-northeast-1`) or reset the DB password.
2. `gcloud run services update jarvis-backend --region asia-south1 \
   --update-env-vars DATABASE_URL='postgresql+asyncpg://…?ssl=require'`
3. Optional: replace embedded Redis with Upstash by setting `REDIS_URL`.
4. Add GitHub secrets `BACKEND_URL` + `BACKEND_CRON_SECRET` once `/health` is 200.
5. Sync `NEXTAUTH_SECRET` with Vercel before any frontend cutover.

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

## Known documentation drift (from AUDIT.md)

- F-02: **fixed** — migrations live in `supabase/migrations/`.
- F-04: **resolved** — app is on Next 16; 0 production npm advisories.
  Remaining high/critical are dev-only (vitest chain) in
  `frontend/audit-baseline.json`.
- F-10: **fixed** — Dependabot ignores majors only for typescript / vitest /
  tailwindcss; `npm-audit.yml` gates the rest.
- Root `supabase-schema-*.sql`: **archived** under
  `docs/archive/supabase-schema/` (canonical path is still
  `supabase/migrations/`).

Still open (needs you): F-01 backend deploy (Upstash + `gcloud`); confirm
which Gemini API key Vercel uses and delete the unused GCP key.

Full findings table: [AUDIT.md](AUDIT.md).

---

*Last updated: 2026-11-04 (F-05/F-09/CSP/Cloud Run attempt).*
