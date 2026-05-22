# JARVIS OS

An AI-powered, self-hosted personal operating system. Agent-orchestrated, memory-backed, production-grade.

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Fill in .env — minimum required:
#   POSTGRES_PASSWORD, REDIS_PASSWORD, SECRET_KEY, FINANCIAL_ENCRYPTION_KEY
#   NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_AI_API_KEY

# 2. Start all services
docker compose up -d

# 3. Open the app
open http://localhost:3000
```

## Prerequisites

- Docker + Docker Compose v2
- Google Cloud project with OAuth 2.0 credentials (for sign-in)
- Google AI API key (Gemini) — free tier works for Phase 1

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for system diagram and ADRs.

## Development

```bash
# Backend only (local dev without Docker)
cd backend
pip install -e ".[dev]"
cp ../.env.example .env  # fill in values
alembic upgrade head
uvicorn app.main:app --reload

# Frontend only
cd frontend
npm install
npm run dev

# Run tests
cd backend
pytest --cov=app -v
```

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation (Auth, AI Chat, Tasks, Memory) | ✅ Complete |
| 2 | Agent Framework + Knowledge Base | 🔲 Not started |
| 3 | Financial Intelligence | 🔲 Not started |
| 4 | Automation + Integrations | 🔲 Not started |
| 5 | Voice, Reports, Advanced Agents | 🔲 Not started |

## Security

- All secrets in environment variables only
- Financial data AES-256 encrypted at rest
- JWT sessions with 24h expiry + refresh rotation
- TOTP MFA required for Level 4 (autonomous) actions
- Append-only audit log for all Level 3+ actions

## Disclaimer

JARVIS OS is not a licensed financial advisor. The financial module provides analysis and visualization only.
