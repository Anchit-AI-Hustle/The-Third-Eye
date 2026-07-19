# Job Agent — Implementation Record

Native "Job Applier Agent" module for **The Third Eye** (`/job-agent`). This
document captures the repository findings, architecture, decisions, and
deployment steps. It is the source of truth for the module.

## 1. Repository findings (audit)

| Area | Finding | Decision |
|---|---|---|
| Framework | Next.js 14 App Router, React 18, strict TS | Reuse App Router + RSC/client split |
| Auth (active) | **NextAuth v4** (Google OAuth, JWT) via `withAuth` middleware; identity = session **email** | Reuse it. **No second auth system added.** |
| DB / storage | Supabase (`@supabase/supabase-js`), service-role via `/api/data/[entity]`; RLS keyed on `auth.jwt()->>'email' = user_id`; localStorage fallback when unconfigured | Reuse the data API + add Job Agent entities; add a migration with the same RLS pattern |
| AI | `llmCascade({system,messages,jsonMode,maxTokens,temperature,stage}) → {text,provider}` (7-provider fallback) | Reuse as the AI provider abstraction (no new vendor lock-in) |
| Validation | **No zod** in the repo | Hand-rolled runtime validation + `safeJson` + fact-id pruning |
| PDF/DOCX/parse | **None installed** (@react-pdf, docx, mammoth, pdf-parse absent) | Export via **print-to-PDF** (selectable text) + Markdown/TXT; resume import = paste text / portfolio URL. PDF/DOCX binary parsing + native DOCX = documented staged follow-up |
| Test runner | **None** (scripts: dev/build/start/lint only) | Validate via `tsc --noEmit` + `next build`; unit tests added under `vitest` if present, else documented |
| Design system | Tailwind tokens (`bg-background-*`, `text-text-*`, `border-border-default`, `accent-*`, `rounded-card/input`, `holo-card`, `hud-frame`, `hud-label`, `font-display/mono`), `MainLayout` + `Sidebar` | Reuse verbatim — Job Agent is visually native |

## 2. Architecture

```
UI (native, MainLayout+Sidebar)
  /job-agent (home) · /search · /profile · /applications
        │  useJobAgent() hook  → dataClient → /api/data/[entity] → Supabase (service-role, RLS backstop)
        ▼
Domain/services (src/lib/jobAgent)
  sources/*  → JobSourceAdapter registry → runSearch() (Promise.allSettled, per-source timeout, dedupe)
  match.ts   → deterministic hybrid scorer (fact-referenced, no protected data)
  applicationKit.ts → analyze → tailor resume → cover letter → screening answers (truth-constrained + validated)
  documents.ts → one canonical model → HTML (print/PDF) / Markdown / text
        ▼
Provider adapters
  Job sources (Remotive, Arbeitnow inline; Adzuna gated; LinkedIn/Indeed/Glassdoor/Upwork external-search)
  AI = llmCascade   ·   safeFetch (SSRF)   ·   sanitize (untrusted HTML)
```

Data flow (Tailor & Apply): job snapshot → `/api/job-agent/application-kit` →
`buildApplicationKit` (deterministic match always; AI best-effort on top with
graceful degradation) → review UI → **user approval** → immutable resume +
cover-letter snapshots saved → application row created (`ready_to_apply`) →
native side-by-side assistant opens the employer posting. **No auto-submit.**

## 3. Authentication decision

NextAuth v4 (Google, JWT) is the single active system in production. Every Job
Agent route uses `getServerSession(authOptions)`; `/job-agent/*` is added to the
`withAuth` middleware matcher. No Supabase Auth, no duplicate login.

## 4. Database entities + RLS

Migration `frontend/supabase/migrations/20260720000000_job_agent.sql` (idempotent).
User-owned tables (RLS owner policy on `auth.jwt()->>'email' = user_id`):
`job_agent_profiles, career_preferences, candidate_documents, candidate_facts,
saved_jobs, job_matches, resume_documents, cover_letters, answer_library,
applications, application_answers, application_events, agent_runs,
job_agent_settings, job_agent_audit`. Shared cache (`jobs`, `job_source_records`)
is RLS read-only for authenticated users. Uniqueness: one profile/settings per
user, one saved row per (user, job), one application per (user, job), agent runs
by idempotency key, source records by (source, source_job_id). The user-owned
tables are also added to the `/api/data/[entity]` allowlist.

## 5. AI provider abstraction

`llmCascade` (server-only). Job Agent calls it in `jsonMode` with low temperature
for extraction/validation. System prompt is version-controlled in
`src/lib/jobAgent/prompts.ts` (`PROMPT_VERSION = "job-agent-v1"`,
`APPLICATION_AGENT_SYSTEM_PROMPT`). Untrusted content (job descriptions, resume
text, portfolio pages) is wrapped in `<untrusted_*>` delimiters and the prompt
states external instructions are data, never commands. Model output is parsed
with `safeJson`, and every cited fact id is pruned against the real vault
(invented ids are dropped and flagged).

## 6. Job-source compliance

- **Inline (official/permitted APIs):** Remotive, Arbeitnow (both free, documented,
  attribution preserved); **Adzuna** inline only when `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`
  are set, otherwise reported as `unconfigured`.
- **External live-search (ToS forbids scraping):** LinkedIn, Indeed, Glassdoor,
  Upwork — we **never scrape or automate a logged-in account**; we build a
  compliant deep link the user opens themselves.
- All fetches go through `safeFetch` (https-only, no credentials, private-host
  blocked, host allowlist, size cap, `redirect:"error"`). HTML sanitized; plain
  text kept for AI. Search is concurrent with per-source timeout and partial-
  failure tolerance (`Promise.allSettled`). Results normalized + deduped.

## 7. Browser-assistant architecture

The full cross-site extension (`packages/job-agent-extension` with Greenhouse/
Lever/Ashby/SmartRecruiters/Workday adapters, short-lived user-scoped session,
`/api/job-agent/extension/*`) is specified but **staged** (Stage 3). Shipping now
is the **native side-by-side assistant**: after approval it opens the employer
posting, offers copy buttons for approved answers and document downloads, and a
field checklist. It never fills or submits anything automatically — CAPTCHA, MFA,
attestations, and final submit are always the user's action.

## 8. Security boundaries

Service-role key + AI keys are server-only (never in `NEXT_PUBLIC_*` or client
bundles). SSRF-hardened fetch. Untrusted HTML sanitized. Prompt-injection
defense via delimiting + "data not commands" + output validation + fact-id
pruning. Match scoring never uses `protected`/`sensitive` facts. Screening
answers for EEO/legal/sensitive questions force `requiresUserInput`. Feature
flags: `JOB_AGENT_ENABLED` (master kill switch), `JOB_AGENT_AUTOMATION_ENABLED`
(automation off by default).

## 9. Environment variables

See `.env.example`. All optional except that AI features degrade gracefully
without a provider key, and Adzuna/automation stay disabled without their vars.

## 10. Deployment steps

1. `supabase db push` (applies `20260720000000_job_agent.sql`).
2. Set env vars in Vercel (`JOB_AGENT_ENABLED=true`; optional `ADZUNA_*`,
   `JOB_AGENT_AUTOMATION_ENABLED`). AI keys already present via `llmCascade`.
3. Deploy the `the-third-eye` Vercel project from the repo root (root dir = `frontend`).
4. Verify `/job-agent` loads for a signed-in user.

Rollback: set `JOB_AGENT_ENABLED=false` (routes show a disabled state instantly);
the migration is additive and reversible (drop the `job_agent_*`/`candidate_*`/
`applications`/`resume_documents`/`cover_letters` tables if fully removing).

## 11. Known limitations (honest)

- Resume **import** supports pasted text + portfolio URL. **PDF/DOCX binary
  parsing** needs `pdf-parse`/`mammoth` (not installed) — returns a clear message.
- Document **export**: print-to-PDF (selectable text, ATS-safe) + Markdown/TXT.
  **Native DOCX** needs the `docx` package (staged).
- **Browser extension + ATS-specific adapters**: specified, staged; native
  side-by-side assistant ships now.
- **Durable queue**: kit generation runs inline within the request (≤60s) with
  graceful degradation; a queue abstraction is a Stage-3 follow-up.
- **No unit-test runner** in the repo; validated via `tsc` + `next build` (and
  `vitest` unit tests where available — see the test file).
