# JARVIS OS — Architecture Document (Phase 1)

## System Overview

JARVIS OS is a self-hosted, agent-orchestrated personal operating system. It provides a unified interface for scheduling, finance, knowledge, research, tasks, and automation through voice, text, and structured UI.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User Interfaces                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Web Browser │  │  Mobile PWA  │  │    Voice Console (Ph5)   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└─────────┼─────────────────┼───────────────────────┼────────────────┘
          │                 │                        │
          └─────────────────▼────────────────────────┘
                            │ HTTPS / WSS
┌───────────────────────────▼─────────────────────────────────────────┐
│                         Nginx Reverse Proxy                          │
│                    (TLS termination, rate limiting)                  │
└───────────────────────────┬─────────────────────────────────────────┘
          ┌─────────────────┼──────────────────────┐
          │                 │                       │
          ▼                 ▼                       ▼
┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Next.js 14     │ │   FastAPI        │ │   n8n            │
│  Frontend       │ │   Backend        │ │   Workflow Engine │
│  (Port 3000)    │ │   (Port 8000)    │ │   (Port 5678)    │
└────────┬────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                   │                      │
         │          ┌────────┼──────────────────────┘
         │          │        │
         │    ┌─────▼──┐  ┌──▼──────────────────────────────────────┐
         │    │ Redis  │  │            PostgreSQL 16                 │
         │    │  7     │  │  ┌─────────┐ ┌──────────┐ ┌──────────┐  │
         │    │Sessions│  │  │  Core   │ │  Memory  │ │ Finance  │  │
         │    │Queues  │  │  │  Tables │ │  Tables  │ │  Tables  │  │
         │    │Cache   │  │  └─────────┘ └──────────┘ └──────────┘  │
         │    └────────┘  │  ┌─────────┐ ┌──────────┐ ┌──────────┐  │
         │                │  │  Tasks  │ │Knowledge │ │ Agents   │  │
         │                │  │  Tables │ │pgvector  │ │  Logs    │  │
         │                │  └─────────┘ └──────────┘ └──────────┘  │
         │                └────────────────────────────────────────  ┘
         │
         └──────────────────────────────────────────────────────────
                               NextAuth.js
                         (Google OAuth, Email+MFA)
```

## Data Flow — Chat Request

```
User Input
    │
    ▼
NextAuth Session Validation
    │
    ▼
FastAPI Chat Endpoint (POST /api/v1/chat)
    │
    ├─► Memory Retrieval Pipeline
    │       Query → Embed (text-embedding-3-small)
    │       → pgvector cosine search (top-k=10)
    │       → Re-rank by recency + relevance
    │       → Inject top-5 into context
    │
    ├─► Executive Agent
    │       → Analyze task type
    │       → Select specialist agent (Phase 2+)
    │       → Select model via ModelRouter
    │
    ├─► ModelRouter.select_model()
    │       → Check task_type, tokens, latency
    │       → Default: Gemini 1.5 Flash
    │       → Exponential backoff + failover
    │
    ├─► AI Provider API Call
    │       → Log: model, tokens, latency, cost
    │
    ├─► Memory Write (async)
    │       → Episodic: store interaction
    │       → Semantic: extract facts (nightly)
    │
    └─► Response → User
```

---

## Architecture Decision Records (ADRs)

### ADR-001: Application-Level Tenancy vs. PostgreSQL Row-Level Security

**Decision:** Application-level tenancy (user_id FK on all tables, enforced in query layer)

**Context:** Phase 1 is a personal/small-team OS. We need data isolation but not enterprise multi-tenancy.

**Options considered:**
- **PostgreSQL RLS:** Database enforces isolation at the row level. More secure, but adds schema complexity, makes migrations harder, and requires `SET LOCAL app.user_id` on every connection — problematic with connection pooling (PgBouncer).
- **Application-level:** All queries include `WHERE user_id = :current_user_id`. Simpler, faster to develop, compatible with any ORM pattern.

**Trade-offs:**
- RLS: Higher security guarantee, harder to misconfigure accidentally
- App-level: Developer must not forget the filter (mitigated by BaseRepository pattern)

**Resolution:** Application-level for Phase 1. A `BaseRepository` class enforces user_id filtering. RLS revisited in Phase 4 if multi-user hosting becomes a priority.

---

### ADR-002: Redis Streams vs. Celery for Task Queue

**Decision:** Redis Streams

**Context:** Background jobs needed for: memory consolidation, embedding generation, nightly reports.

**Options considered:**
- **Celery:** Mature, battle-tested, supports complex workflows, result backends. Requires separate worker processes, Flower for monitoring, higher operational overhead.
- **Redis Streams:** Built into Redis (already in stack). Sufficient for Phase 1 job volume. Consumer groups for reliability. No additional services. Simpler ops.

**Trade-offs:**
- Celery: More features (retries, routing, chords), but adds 2 new services to manage
- Redis Streams: Fewer dependencies, enough for < 1k jobs/day volume of a personal OS

**Resolution:** Redis Streams for Phase 1-3. Celery if job volume or complexity exceeds Redis Streams capabilities (revisit in Phase 4 with automation workflows).

---

### ADR-003: pgvector vs. Qdrant for Embeddings

**Decision:** pgvector (PostgreSQL extension)

**Context:** Vector similarity search needed for memory retrieval and document RAG.

**Options considered:**
- **Qdrant:** Purpose-built vector DB, better filtering, higher query performance at scale, richer indexing options. Requires a separate service and sync between PG and Qdrant.
- **pgvector:** Single database for all data. Simpler operational model. Adequate for < 1M vectors (personal OS scale). Native SQL JOINs against metadata.

**Trade-offs:**
- Qdrant: Better at scale, dedicated filtering, native approx-nearest-neighbor
- pgvector: No data sync needed, SQL joins "for free", simpler deployment

**Resolution:** pgvector for Phase 1-2. Qdrant as an option in Phase 3 if document corpus exceeds 500k chunks or query latency > 2s threshold.

---

### ADR-004: Authentication Strategy

**Decision:** NextAuth.js with Google OAuth + email/password + TOTP MFA

**Context:** Need secure auth with social login, multi-factor for Level 4 actions.

**Resolution:** NextAuth.js handles session management (JWT, 24h + refresh rotation). FastAPI validates sessions via shared secret / token introspection. TOTP (pyotp) required before any Level 4 agent action.

---

## Security Model

| Level | Name | Examples | Approval |
|-------|------|----------|----------|
| 1 | Read Only | Summarize, answer questions | None |
| 2 | Draft Actions | Create task drafts | User review in UI |
| 3 | Execute with Log | Send email, calendar event | Logged, reversible |
| 4 | Autonomous | Computer control, financial writes | Explicit opt-in per session |

All Level 3+ actions write to immutable `audit_log` table (no DELETE allowed).

---

## Regulatory Constraints

- **Financial module:** Disclaimer required on every AI-generated financial response. JARVIS OS is not a licensed financial advisor.
- **GDPR compliance:** All user data is deletable via `DELETE /api/v1/user/me`, exportable via `GET /api/v1/user/export`. No PII sent to AI providers in privacy_mode.
- **Financial data:** AES-256 encrypted at rest. TLS 1.3 in transit.

---

## AI Model Routing Rules

| Task Type | Default | Fallback | Never Use |
|-----------|---------|----------|-----------|
| Simple chat | Gemini 1.5 Flash | GPT-4o-mini | Pro/Opus |
| Document summarization | Gemini 1.5 Flash | Claude Haiku | — |
| Complex reasoning | Gemini 1.5 Pro | GPT-4o | — |
| Code generation | GPT-4o-mini | Gemini Flash | — |
| Embeddings | text-embedding-3-small | Gemini embedding | — |
| Financial analysis | Gemini 1.5 Pro | GPT-4o | Gemini Flash |
| Local/offline | Ollama (llama3) | None | Cloud |
