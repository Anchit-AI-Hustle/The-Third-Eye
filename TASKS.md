# JARVIS OS — Remaining Work by Phase

## Phase 1 (current) — Remaining

- [ ] Run `docker compose up` and fix any startup errors
- [ ] Verify Google OAuth flow end-to-end
- [ ] Run `pytest --cov=app` and confirm ≥ 80% coverage
- [ ] Run `npm run build` and fix any TypeScript errors
- [ ] Add `postcss.config.js` for Tailwind (required by Next.js)
- [ ] Test task creation via chat ("create a task: ...")
- [ ] Add TOTP enrollment UI (non-blocking for Phase 1 exit)

## Phase 2 — Agent Framework + Knowledge Base ✅ Complete

- [x] Agent registry with capability lookup
- [x] ResearchAgent (Serper API + LLM synthesis)
- [x] KnowledgeAgent (RAG-backed document Q&A)
- [x] ProductivityAgent (task creation + scheduling)
- [x] Orchestrator with intent routing + delegation depth guard
- [x] Document upload endpoint (multipart, async background processing)
- [x] PDF parser (pypdf)
- [x] DOCX (python-docx) / XLSX (openpyxl) / CSV / TXT / Markdown parsers
- [x] Chunk pipeline (tiktoken, 512 tokens, 50 overlap, boundary-aware)
- [x] Batch embedder (≤100 chunks per call)
- [x] Knowledge base UI (drag-and-drop, list, search with citations)
- [x] Memory consolidation scheduler (APScheduler nightly)
- [x] Multi-agent delegation test suite

## Phase 3 — Financial Intelligence

- [ ] Financial encryption service (Fernet AES-256)
- [ ] CSV bank export importer
- [ ] Transaction categorization (regex + AI)
- [ ] Financial dashboard (net worth, cash flow, spending)
- [ ] Subscription detection algorithm
- [ ] FinancialAgent implementation
- [ ] Regulatory disclaimer middleware
- [ ] Encryption at-rest verification tests

## Phase 4 — Automation + Integrations

- [ ] n8n webhook bridge (POST /api/v1/webhooks/n8n)
- [ ] Google Calendar connector
- [ ] Gmail connector
- [ ] Slack connector
- [ ] Automation builder UI
- [ ] AutomationAgent implementation
- [ ] Workflow execution log viewer
- [ ] Level 3 permission gate for all connector actions

## Phase 5 — Voice, Reports, Advanced Agents

- [ ] Whisper STT endpoint (multipart audio)
- [ ] Voice console UI (push-to-talk)
- [ ] Daily briefing generator (scheduled, < 10s)
- [ ] Weekly + monthly review generators
- [ ] CodingAgent (sandboxed code execution)
- [ ] Playwright sandbox (Level 4 opt-in, full audit log)
- [ ] Complete voice flow end-to-end test
