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

### ADR-005: Document Ingestion Strategy (Phase 2)

**Decision:** In-process parsers, synchronous parsing, asynchronous embedding via Redis Streams

**Context:** Documents (PDF, DOCX, XLSX, CSV, TXT, Markdown) must be parsed, chunked, embedded, and stored. Question: do we parse inline (request blocks until done), in a queue worker, or via a dedicated service?

**Options considered:**
- **External service (e.g., Unstructured.io):** Higher fidelity (tables, images), but adds another service, costs $$/page, and sends documents to a third-party (GDPR concern).
- **Queue worker (Celery):** Decouples request from processing, but we already chose Redis Streams; doubling up adds complexity.
- **In-process parse + async embedding:** Parser runs in the request, returns 202 Accepted with document ID. Embedding is queued (Redis Stream) and processed by a background consumer. User polls or websockets for status.

**Resolution:** In-process parsing (fast — < 5s for typical PDF) + async embedding via Redis Streams. Sensitive documents never leave the user's stack. Upload endpoint returns 202 with `processing_status=pending`; client polls `/documents/{id}` for `ready`.

---

### ADR-006: Chunking Approach (Phase 2)

**Decision:** Fixed-size token-based chunks (512 tokens, 50 token overlap) with paragraph/sentence boundary preference

**Context:** RAG quality depends heavily on chunk granularity. Too small → fragments lack context; too large → embedding dilution and irrelevant text in results.

**Options considered:**
- **Semantic chunking (embed-then-cluster):** Highest quality, but 2-3x slower and requires double embedding pass.
- **Fixed-size character chunks:** Trivial to implement, but breaks across token boundaries and produces inconsistent embedding inputs.
- **Fixed-size token chunks (tiktoken-based):** Token-aligned with `cl100k_base` (matches `text-embedding-3-small`), respects paragraph and sentence boundaries when possible, with overlap to preserve context across boundaries.

**Resolution:** 512-token chunks with 50-token overlap. Chunker first tries to break on paragraph boundaries, then sentence boundaries, then falls back to hard token cuts. Empirically retrieves well for typical knowledge-worker documents.

---

### ADR-007: Agent Registry Pattern (Phase 2)

**Decision:** Singleton registry with explicit registration at import time; orchestrator dispatches by intent classification + capability match

**Context:** Multiple agents (Executive, Research, Knowledge, Productivity, etc.) must be reachable by name and discoverable by capability. We must avoid hardcoded if/else chains.

**Options considered:**
- **Hardcoded dispatcher:** Simple, but every new agent requires editing the dispatcher.
- **Plugin auto-discovery (entry points):** Most flexible, but premature complexity for an in-tree codebase.
- **Explicit registration in `__init__` of each agent module:** Agents call `registry.register(self)` at module import. Orchestrator queries registry by `intent` and `capability`.

**Resolution:** Explicit registration with two lookup methods: `registry.get(name)` for direct lookup, `registry.list_capable(capability)` for capability matching. Registry is a process-local singleton; multi-process workers will each have an identical copy (deterministic registration order ensures consistency).

---

### ADR-008: Memory Consolidation Scheduler (Phase 2)

**Decision:** APScheduler (in-process) for Phase 2; revisit for distributed deployments

**Context:** Memory consolidation needs to run nightly: summarize old episodic memories into semantic facts, prune expired records, write audit reports.

**Options considered:**
- **Redis Streams consumer with cron-like wake-up:** Consistent with ADR-002 (queue), but adds complexity for a single nightly task.
- **External cron + HTTP endpoint:** Simple, but couples to host OS and breaks in containerized deployments.
- **APScheduler in-process:** Lives inside the FastAPI process, persists job state to PostgreSQL, supports cron-style triggers, survives restarts.

**Resolution:** APScheduler with PostgreSQL job store for Phase 2. For multi-worker deployments (Phase 4+), revisit by moving consolidation to a dedicated worker process with Redis Streams locks to ensure single execution.

---

### ADR-009: Financial Data Encryption (Phase 3)

**Decision:** Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256) on amount fields; key in environment variable only; never logged

**Context:** Account balances, transaction amounts, budget caps, and subscription costs must be encrypted at rest. The application needs both decrypt (for queries) and encrypt (for writes) — symmetric is the only viable choice.

**Options considered:**
- **Application-level Fernet:** Standardized in `cryptography` library; combines AES-128-CBC with HMAC integrity check; key rotation supported. Adds ~80 bytes overhead per value.
- **PostgreSQL `pgcrypto`:** Encryption at the DB layer; queries can decrypt server-side. Couples to PG, awkward for application-side arithmetic.
- **AES-256-GCM via raw cryptography:** Slightly faster and more compact, but custom implementations risk authentication bypass bugs.

**Resolution:** Fernet (AES-128-CBC + HMAC-SHA256) — well-reviewed, batteries-included, integrity-checked. Key sourced from `FINANCIAL_ENCRYPTION_KEY` env var validated at startup. Decryption happens in the service layer, never in the API layer or logs.

---

### ADR-010: CSV Import Strategy (Phase 3)

**Decision:** Heuristic column detection with named profiles (Chase, BofA) + generic fallback; idempotent inserts via hash key

**Context:** Bank exports vary in column order, naming (Date vs. Posting Date vs. Transaction Date), and amount sign convention (positive=debit vs. negative=debit). User must be able to upload without manual mapping in most cases.

**Options considered:**
- **External library (e.g., csvkit, plaid-python):** Mature but adds dependencies. Plaid requires API account.
- **AI-based column mapping:** Robust but adds 1-2s per import and burns tokens. Required only for unusual formats.
- **Heuristic detection + named profiles + manual mapping fallback:** Detects common headers (date, amount, description) via regex; named profiles handle quirks (Chase signs amounts negative for debits, BofA uses "Posted Date").

**Resolution:** Named profiles for Chase and BofA, generic heuristic fallback, AI column mapping deferred to Phase 6 if needed. Each row's hash (date + amount + description) is checked for duplicates to make re-imports idempotent.

---

### ADR-011: Regulatory Disclaimer Strategy (Phase 3)

**Decision:** Decorator-applied disclaimer at the Financial Agent boundary; UI also renders inline

**Context:** Every AI-generated financial response must carry the disclaimer "JARVIS OS is not a licensed financial advisor..." per regulatory constraint. Forgetting it is a compliance risk.

**Resolution:** A `@with_disclaimer` decorator wraps Financial Agent methods and appends the disclaimer to their text output. The frontend also renders a `<FinanceDisclaimer />` component below any AI insight as a defense-in-depth. A test asserts 100% disclaimer presence across all financial AI outputs.

---

### ADR-012: Forecasting Approach (Phase 3)

**Decision:** Rolling-average extrapolation with category-level seasonality; no ML model in Phase 3

**Context:** Forecasting cash flow 30/90/365 days out requires balancing accuracy against complexity. ML models (Prophet, ARIMA) add training infrastructure and explainability concerns.

**Resolution:** Per-category rolling 90-day mean, projected forward; subscription charges added explicitly from the subscriptions table on their billing dates. Variance ±15% is acceptable for personal finance forecasting. Upgrade to a proper time-series model is a Phase 6 candidate if accuracy proves insufficient.

---

## Document Ingestion Pipeline (Phase 2)

```
Upload → ingestion.parse(file)
              │
              ▼
        chunker.split(text)        ← 512 token chunks, 50 overlap
              │
              ▼
     [Redis Stream: embed_queue]
              │
              ▼
        embedder.batch(chunks)     ← max 100 chunks/call
              │
              ▼
     INSERT INTO document_chunks
     UPDATE documents SET processing_status='ready'
```

## Agent Delegation Flow (Phase 2)

```
User → POST /chat
        │
        ▼
   Orchestrator.dispatch(task, context)
        │
        ├─► classify_intent(content)  → executive | research | knowledge | productivity
        │
        ├─► registry.get(agent_name)
        │
        ├─► agent.run(task, context)
        │       │
        │       └─► [optional] orchestrator.delegate(target_agent)  ← guard depth ≤ 3
        │                            │
        │                            ▼
        │                       child_agent.run(...)
        │
        ▼
    Compose response → audit_log → return
```

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
