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
