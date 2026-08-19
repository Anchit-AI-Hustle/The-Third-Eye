# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Token Efficiency (MANDATORY)
- Responses: shortest possible. No preamble, no recap, no summary.
- Code: no comments unless the WHY is non-obvious. No docstrings.
- No "I'll now...", "Let me...", "Great!" or similar filler.
- Tool calls: batch all independent calls in one message.
- Skip explaining what you just did — the diff speaks.
- One sentence max per status update while working.

## Coding Standards
- No dead code, no unused imports, no backwards-compat shims.
- No defensive error handling for impossible cases.
- No abstractions beyond what the task requires.
- Prefer editing existing files over creating new ones.
- No markdown docs unless explicitly requested.

## Stack

**The live product is `frontend/`.** Next.js 14 App Router + TypeScript,
NextAuth (Google OAuth, JWT sessions), Supabase (Postgres + pgvector) as the
data layer, Tailwind + Radix UI, a 7-provider server-side LLM cascade
(`lib/llmCascade.ts`), deployed on Vercel with auto-deploy on `main`. Full
detail, updated as things ship: **[DEVELOPMENT.md](DEVELOPMENT.md) — read
that before making frontend changes, it's more current than this file.**

`backend/` (FastAPI + SQLAlchemy 2.0 async + asyncpg, Python 3.12, Alembic,
Redis Streams, pgvector, APScheduler; package `jarvis-backend`) is a
separately-developed agent/RAG service. It is **not deployed anywhere and
the live frontend does not call it** — see
[PROJECT_STATUS.md](PROJECT_STATUS.md) and `AUDIT.md` finding F-01 for the
open retire-vs-deploy decision. Its architecture below is accurate to
itself but should not be assumed to describe the live app.

`docker-compose.yml` orchestrates Postgres 16, Redis 7, Nginx, n8n,
backend, frontend for a hypothetical full local stack — not how the live
product actually runs (that's Vercel + Supabase, no Docker).

## Common Commands

Frontend (from `frontend/`, this is the live app):
```bash
npm install
npm run dev
npm run build                    # must produce zero TS errors
npm run type-check
npm run lint
npm test                         # vitest
```

Backend (from `backend/`, not deployed — see Stack above):
```bash
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
pytest --cov=app -v              # coverage must be ≥80% (enforced in pyproject.toml)
pytest tests/test_agents.py::test_executive_delegates_to_research_and_composes  # single test
ruff check app                   # line-length 100, py312
alembic revision --autogenerate -m "msg"
```

## Architecture

### Frontend layout (`frontend/src/`) — the live product
- `app/` — Next.js App Router pages and route handlers, including
  `app/api/chat/route.ts` (the real assistant entrypoint — a Gemini
  function-calling tool loop, ~25 tools, streaming SSE) and
  `app/api/data/[entity]/route.ts` (the one server route all persisted
  reads/writes go through — service-role Supabase client, identity from
  the session, never the request body).
- `components/` — 27 component directories: UI primitives (Radix +
  Tailwind), feature surfaces (Assistant, Studio incl. Music Studio,
  App Hub, Knowledge, dashboard widgets, capture/vision).
- `lib/` — `llmCascade.ts` (provider cascade), `cortex.ts` (RAG/memory),
  `mcp/client.ts` (external MCP tool integration), `agentControl.ts`
  (kill switch + audit log), `dataClient.ts` (Supabase-or-localStorage
  fallback), `apps/registry.ts` (App Hub entries).
- **Design tokens: `frontend/DESIGN.md`** is the source of truth for colours, type, spacing, radius, and motion. Follow it for all UI styling. `tailwind.config.ts` and `globals.css :root` define the same 13 colour values — keep them in step when changing either.
- Full architecture, request flow, and "where to make common changes" table: **[DEVELOPMENT.md](DEVELOPMENT.md)**.

### Backend layout (`backend/app/`) — not deployed, see Stack above
- `main.py` — FastAPI app, lifespan starts APScheduler for memory consolidation.
- `config.py`, `database.py` — settings (pydantic-settings) + `AsyncSessionLocal`.
- `api/` — route modules (chat, documents, knowledge, tasks, etc.). Routes call agents/services; they do NOT call AI providers directly.
- `agents/` — agent framework. `registry.py` is a singleton; each agent module registers itself at import time (ADR-007). `orchestrator.py` classifies intent, dispatches by name, supports cross-agent delegation guarded at depth ≤ 3. Agents: `executive`, `research` (Serper), `knowledge` (RAG), `productivity`.
- `router/` — `ModelRouter` selects AI provider/model per task type with exponential backoff failover. Default Gemini 1.5 Flash; financial analysis uses Pro (never Flash). See routing table in `ARCHITECTURE.md`.
- `memory/` — episodic + semantic memory; `consolidation.py` is the APScheduler nightly job (Postgres job store) that summarizes old episodes into semantic facts and prunes expired records.
- `knowledge/` — document ingestion pipeline: `ingestion.py` (PDF/DOCX/XLSX/CSV/TXT/MD parsers, in-process per ADR-005) → `chunker.py` (512 tokens, 50 overlap, paragraph/sentence boundary preference per ADR-006) → `embedder.py` (batched ≤100 chunks) → `retriever.py` (top-10 + re-rank → top-5) → stored in pgvector.
- `finance/` — Phase 3 scaffolding. Fernet (AES-128-CBC + HMAC) symmetric encryption on amount fields (ADR-009); key from `FINANCIAL_ENCRYPTION_KEY` env var. `@with_disclaimer` decorator on Financial Agent appends the regulatory disclaimer (ADR-011).
- `tasks/` — background work consumed via Redis Streams (ADR-002).
- `auth/` — NextAuth-issued JWT validated server-side; TOTP (`pyotp`) for Level 4 actions.

### Tenancy & repository pattern (`backend/`)
Application-level tenancy (ADR-001): every domain table has `user_id FK`. A `BaseRepository` enforces `WHERE user_id = :current_user_id` — do not bypass it. No PostgreSQL RLS. (The live frontend instead uses Postgres RLS directly — see `supabase/migrations/*_rls_hardening.sql` — a different tenancy model; don't mix the two up.)

### Chat request flow (`backend/`, not the live flow)
`POST /api/v1/chat` → NextAuth session validation → memory retrieval (embed query, pgvector cosine search top-10, re-rank by recency+relevance, inject top-5) → `Orchestrator.dispatch` (intent classification + agent registry lookup, optional delegation) → `ModelRouter.select_model` → AI provider call (logs model, tokens, latency, cost) → async memory write → response. See `ARCHITECTURE.md` for the full diagram. **The live product's actual chat flow is different** — see DEVELOPMENT.md §3.

### Security levels (`backend/`)
1 read-only, 2 drafts, 3 execute-with-log (audit_log is append-only — no DELETE), 4 autonomous (requires TOTP + explicit per-session opt-in). The live frontend's equivalent safety model is confirm-then-act on sensitive tools + a global kill switch + append-only activity log — see DEVELOPMENT.md §10.

### Status
See [PROJECT_STATUS.md](PROJECT_STATUS.md) for current state of both the live product and `backend/`, and `AUDIT.md` for open findings. ADRs (1–12) are in `ARCHITECTURE.md` — consult them before deviating from `backend/`'s existing patterns.

### Regulatory (`backend/`, scaffolding — not verified live)
- Every AI-generated financial response must carry the "not a licensed financial advisor" disclaimer (decorator + frontend `<FinanceDisclaimer />`). A test asserts 100% disclaimer coverage on financial AI outputs.
- All user data deletable via `DELETE /api/v1/user/me`, exportable via `GET /api/v1/user/export`. `privacy_mode` blocks sending PII to AI providers.
