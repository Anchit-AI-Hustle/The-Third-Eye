# Security Policy

## Scope

The live product is `frontend/` (Next.js on Vercel + Supabase). `backend/`
is a separate, undeployed FastAPI service (see
[PROJECT_STATUS.md](PROJECT_STATUS.md)) — vulnerabilities there matter for
code quality but have no production blast radius today.

## What's in place

- CodeQL and a Strix security scan run in CI on every PR
  (`.github/workflows/`).
- RLS enforced on every Supabase table; all reads/writes go through one
  server route that derives identity from the session, not the request
  body (see `DEVELOPMENT.md` §4).
- World-changing assistant tools (e.g. sending email) require explicit
  user confirmation before running; an append-only audit log and a global
  kill switch cover agent actions (`/activity`).
- Dependabot for dependency updates (`.github/dependabot.yml` currently
  ignores major-version bumps — tracked as a known gap in
  [AUDIT.md](AUDIT.md), finding F-10).

## Reporting a Vulnerability

Open a private GitHub Security Advisory on this repository
(**Security → Advisories → Report a vulnerability**) rather than a public
issue. Include what you found, how to reproduce it, and its impact. This
is a single-maintainer project — expect an initial response within a few
days, not an SLA.

Do not include real secrets, tokens, or production data in a report.
