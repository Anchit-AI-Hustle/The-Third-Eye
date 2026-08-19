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

**Open decision (AUDIT.md F-01):** retire `backend/` (keep as reference or
archive), or actually deploy and wire it in. Not decided — do not assume
either direction when working in this repo.

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
