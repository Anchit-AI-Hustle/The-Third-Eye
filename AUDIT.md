# AUDIT.md — Phase 0 Inventory

Read-only. Zero files modified for this document (one unrelated, isolated
one-line-message fix was made and merged as PR #241 at the user's explicit
mid-session request — a stub message pointing at a nonexistent Settings tab —
before this audit converged; it is not part of the audit's findings or fixes
and required no gate).

## 0. Corrections to the brief before anything else

Per the brief's own honesty requirement — verified, not assumed:

- **No `legacy/` directory exists anywhere in the tree or in `git log --all`.**
  No Python ingestion pipeline, no Gmail/Chat/mic extraction module, no
  SQLite/Sheets mirror. The "should `legacy/tasks.xlsx` be gitignored"
  question is moot — the file and the directory it would live in don't exist.
- **No `MERGE_NOTES.md` exists**, and no commit in `git log --all` references
  a merge from a `Personal-AI-OS` repository. `git remote -v` shows only this
  repo. A Vercel project named `personal-ai-os` exists in the same team
  account, created two months before `the-third-eye`'s Vercel project — it
  looks like a **separate, still-independent project**, not something merged
  into this repo's history.
- The four claimed CodeQL fixes **are present and verified** (§5, PASS).

## 1. Repository map

```
frontend/    Next.js 14 App Router — the entire live product (chat, tasks,
             Music Studio, voice, Gmail/Calendar, billing, knowledge/RAG).
             98 commits. Deployed to Vercel project "the-third-eye".
backend/     FastAPI + SQLAlchemy async + Alembic — agents, chat, tasks,
             knowledge, finance, memory-consolidation modules. 100% test
             coverage (enforced). 13 commits, all clustered around building
             out that coverage. See §4 — not part of the live product.
android/,    Capacitor native shells wrapping the frontend.
ios/
supabase/    6 canonical migrations (config.toml lives here — see §4.3).
frontend/    5 more migrations, including RLS hardening, stranded (§4.3).
 supabase/
supabase-    10 loose, non-timestamped .sql files at repo root — a third,
 schema-*.sql  unreconciled schema path (§4.3).
docker-      Orchestrates postgres, redis, backend, frontend, nginx, n8n —
 compose.yml  a real local full-stack story that production does not follow.
```

Entrypoints: `frontend/src/app/api/*` (Next.js route handlers — the actual
live API surface), `backend/app/main.py` (FastAPI app — not deployed, §4.1).

## 2. Dependency manifests & lockfile state

| Manifest | State |
|---|---|
| `frontend/package.json` + `package-lock.json` | Present, lockfile in sync, `npm ci` succeeds. |
| `backend/pyproject.toml` | `requires-python = ">=3.12"`. No lockfile (no `uv.lock`/`requirements.lock`) — dependency versions are ranges (`>=`), not pinned. Reproducible builds rely on PyPI availability at install time, not a lockfile. |
| root `package.json` | Capacitor-only (`cap:sync`, `cap:ios`, `cap:android`) — not a workspace root for frontend/backend. |

## 3. Command output — real, unedited

### frontend/ (Node 22, `npm ci` already satisfied)

```
$ npm run type-check
> tsc --noEmit
(no output — clean)

$ npm run lint
> next lint
9 warnings (react-hooks/exhaustive-deps ×3, @next/next/no-img-element ×6)
0 errors

$ npm test  (vitest run)
Test Files  31 passed (31)
     Tests  447 passed (447)

$ npm run build
✓ Compiled successfully
```

### backend/ (fresh venv, Python 3.12.3, `pip install -e ".[dev]"`)

```
$ ruff check app
All checks passed!

$ pytest
6 failed, 444 passed, 4 warnings in 47.42s

FAILED tests/test_knowledge.py::test_chunker_short_input_single_chunk
FAILED tests/test_knowledge.py::test_chunker_respects_token_size
FAILED tests/test_knowledge.py::test_chunker_preserves_total_information
FAILED tests/test_knowledge.py::test_chunker_chunks_have_sequential_indices
FAILED tests/test_knowledge.py::test_count_tokens_consistent
FAILED tests/test_knowledge.py::test_pipeline_chunks_and_persists

requests.exceptions.ProxyError: HTTPSConnectionPool(host='openaipublic.blob.core.windows.net', ...)
Tunnel connection failed: 403 Forbidden

TOTAL coverage: 2082 stmts, 0 missed, 100.00%
Required test coverage of 100% reached.
```

All 6 failures share one root cause: `chunker.py`'s `tiktoken.get_encoding()`
downloads its BPE file from `openaipublic.blob.core.windows.net` on first use
(confirmed at `backend/app/knowledge/chunker.py:22`) and this sandbox's egress
proxy blocks that host. **This is very likely an artifact of my sandbox, not a
real failure** — `ci.yml`'s own `pytest --cov=app -q --maxfail=1` run has
passed on every one of the last 8 pushes to `main` (verified via the Actions
API), which would be impossible if this failure were real on a
network-unrestricted runner. Flagged as a finding anyway (§5, F-09) because a
test suite that silently depends on live third-party network access at test
time is fragile by construction, wherever it happens to still pass today.

## 4. The headline finding: the backend is not part of the live product

This reframes what "go live" even means here, so it's stated up front rather
than buried in the table.

### 4.1 — No FastAPI backend is deployed anywhere

- No `fly.toml`, `railway.json/toml`, or `render.yaml` exists in the repo.
- Vercel (`list_projects` on this team) has no second project for a backend
  service — only `the-third-eye` (the frontend).
- `frontend/src/lib/auth.ts:7` — `BACKEND_URL` defaults to
  `http://backend:8000`, a `docker-compose`-only hostname that resolves to
  nothing outside that compose network.

### 4.2 — The one wire that exists is dead-ended and fails silently

`frontend/src/lib/auth.ts:78-90` — on sign-in, NextAuth POSTs the Google
`id_token` to `${BACKEND_URL}/api/v1/auth/session` to get a `backendToken`,
wrapped in `try { ... } catch {}`. If the backend is unreachable (it is, in
production), sign-in **succeeds anyway** — the catch silently swallows the
failure and `token.backendToken` is simply never set.

That token, if it ever were set, has nowhere to go:
`grep -rl "from \"@/lib/api\"" frontend/src` returns **zero files**.
`frontend/src/lib/api.ts` — the Axios client configured to call
`${BACKEND_URL}/api/v1` — is imported nowhere in the frontend. It is dead
code.

### 4.3 — The live product re-implements everything backend/ also has

`backend/app/api/{chat,tasks,knowledge,documents}.py` and
`backend/app/agents/*` (orchestrator, executive, research, knowledge,
productivity agents — 100%-covered, real, well-tested) have functionally
equivalent, independently-implemented counterparts already live in
`frontend/src/app/api/{chat,tasks,knowledge,documents}/route.ts`, which talk
directly to Supabase and the AI providers. The two were built in parallel and
never reconciled. `backend/`'s 13-commit history (all clustered around
reaching 100% coverage) versus `frontend/`'s 98 actively-developed commits is
consistent with this: the backend was built out and hardened in isolation,
but the product shipped on the Next.js implementation instead.

### 4.4 — Consequence for the "Definition of Live" bar

Criterion #3 ("Backend deploys, `/health` returns 200, OpenAPI docs load")
and #4 ("Frontend ↔ backend calls succeed in production — prove with a real
round-trip") are **currently false**, and not close — there is no backend
deployment to test against.

Two genuinely different paths forward, and I can't pick between them for you:

- **(A) Retire it.** Mark `backend/` explicitly out of scope for "live,"
  since the frontend doesn't need it. Keep it as-is (it's well-tested, not
  broken) or archive it. Removes criteria #3/#4 from the live bar entirely,
  or redefines them against the frontend's own health surface.
- **(B) Actually wire it in.** Deploy it for real (§ Target Hosting), and
  either migrate the frontend onto it or find what unique value it adds that
  isn't already duplicated. Substantially larger scope than anything else in
  this audit — this is a second project, not a fix.

This is the first thing Gate 1 needs a decision on.

## 5. Findings

| ID | Severity | Category | File:line | Evidence | Why it blocks/degrades "live" | Proposed fix | Risk of fixing | Effort |
|---|---|---|---|---|---|---|---|---|
| F-01 | P0 | Pending | `frontend/src/lib/auth.ts:7`, `frontend/src/lib/api.ts` | No backend deployment exists; the one integration point fails silently; the client is imported nowhere | Live criteria #3/#4 are false; the entire `backend/` investment is disconnected from the product | Decide (A) retire or (B) deploy+wire — see §4.4 | Low either way; (B) is large | Decision, then S (A) or XL (B) |
| F-02 | P0 | Inaccurate/Pending | `supabase/config.toml` (root) vs `frontend/supabase/migrations/*` | `config.toml` lives at repo root, so `supabase db push` only ever reads `./supabase/migrations/` (6 files). 5 migrations sit in `frontend/supabase/migrations/`, including `20260719000000_rls_hardening.sql`, and can never be applied by the standard CLI workflow from either location as currently laid out | RLS hardening may never have been applied to the live DB — a real security gap, not just a build inconvenience. Live criterion #5 ("migrations applied and reproducible from committed files") fails for these 5 | Move `frontend/supabase/migrations/*` into `supabase/migrations/` (renumber to keep timestamp order vs the existing 6), delete the empty dir, confirm each is actually applied against the live project (blocked here — `list_migrations` needs an approval I didn't get, see Unknowns) | Low (file move); confirming live DB state needs Supabase access | S |
| F-03 | P1 | Inaccurate | `backend/app/agents/research.py:44` vs `backend/app/config.py` | `SERPER_API_KEY` is read via bare `os.getenv()`, not through the `Settings` model. Every other key in `.env.example` (incl. `SERPER_API_KEY` itself, documented at line 76) is loaded through `Settings(env_file=".env")`. `os.getenv` does **not** see values that live only in a `.env` file — nothing in `app/` calls `load_dotenv()` | A developer following the documented `.env` workflow sets `SERPER_API_KEY` and it is silently never read; web search silently falls back to Google grounding (or reports "unavailable") with no error pointing at the real cause. (Moot for the live product per F-01 — this only matters if backend/ is kept per path B) | Add `serper_api_key: str = ""` to `Settings`, read via `settings.serper_api_key` | Low | XS |
| F-04 | P1 | Dependency health | `frontend/package-lock.json` (next@14.2.35) | `npm audit`: 2 high-severity CVEs in Next.js (DoS, SSRF, cache poisoning, middleware bypass — GHSA-h64f-5h5j-jqjh and others) and a transitive PostCSS XSS/path-traversal chain. Fix requires next@16.3.1, a major bump | Real, currently-unpatched CVEs with public advisories, on the live app, with no automated path to a fix — `dependabot.yml` explicitly ignores major-version updates (confirmed: `update-types: ["version-update:semver-major"]` for `dependency-name: "*"`) | Scope and schedule the Next 14→16 migration deliberately; it's a real project, not a `npm audit fix` | Medium — major-version Next.js bump, needs its own test pass | L |
| F-05 | P2 | Dependency health | `backend/` (pip-audit) | `ecdsa==0.19.2` (transitive, via `python-jose`) has a known vuln, PYSEC-2026-1325, with **no fix version published yet** | Nothing actionable today; monitor | Track upstream; consider `pyjwt`-only (already a direct dep) instead of `python-jose` to drop the `ecdsa` transitive dep entirely | Low | S, later |
| F-06 | P2 | Documentation accuracy | `README.md` (Quick Start, Architecture, Phase Status) | Describes a unified `docker compose up -d` full-stack workflow and claims Phase 1/2 "✅ Complete" (Auth, AI Chat, Tasks, Memory, Agent Framework). True of `backend/`'s own internal completeness (100% coverage, real code) but **not** true of what's live — the live product doesn't run this stack at all (F-01) | A new contributor following this README would build the wrong mental model of what's actually deployed | Rewrite README to describe the actual live architecture (Next.js + Supabase on Vercel) as primary, and `backend/` as a separate, undeployed FastAPI service — pending the F-01 decision | Low (docs only) | M |
| F-07 | P2 | Inaccurate (comment) | `.env.example:61` | Comment claims the Google-search-grounding fallback needs "no extra key beyond `GOOGLE_AI_API_KEY`" — true in isolation, but doesn't mention `enable_google_grounding` (default `True` in `Settings`) has to also not be explicitly disabled | Minor — could confuse someone who set it to `false` and doesn't remember why search silently stopped working | One-line comment addition | None | XS |
| F-08 | P3 | UX/copy | `frontend/src/app/api/chat/route.ts` (health/smart-home stubs) | **Fixed and merged** (PR #241) during this audit at the user's explicit request — pointed at a nonexistent "Settings → Integrations" tab; now points at the real, linked `/capabilities` page | — | — | — | Done |
| F-09 | P3 | Test hygiene | `backend/app/knowledge/chunker.py:22`, `backend/tests/test_knowledge.py` | 6 tests depend on live network access to `openaipublic.blob.core.windows.net` at test time, with no cache/vendoring. Passes in CI (open network) and in most dev machines; fails hard in any network-restricted environment (like this one) | Not blocking today (CI is green), but non-hermetic — will break for anyone auditing/testing in a sandboxed or air-gapped environment, and adds an unnecessary external dependency to "does the code work" | Set `TIKTOKEN_CACHE_DIR` and vendor the `cl100k_base.tiktoken` file, or pre-warm the cache in CI and ship it as a fixture | Low | S |
| F-10 | P2 | Secrets/CVE process | `.github/dependabot.yml` | Confirmed: all major-version bumps are blanket-ignored (`dependency-name: "*"`). This is *why* F-04 exists and will keep existing — Dependabot will never surface the fix | Known-CVE dependencies can sit indefinitely with no automated signal | Narrow the ignore rule to specific packages known to need manual major-bump review, rather than blanket-ignoring all majors repo-wide; or add a scheduled `npm audit`/`pip-audit` CI job that fails loud (not silent) on new high/critical CVEs regardless of major/minor | Low | S |

**Secret hygiene (§6, separate from the table since it's a clean pass, not a
finding):** `.gitignore` covers `.env*` broadly; `git ls-files` shows no
tracked `.env` files; pattern scan (AWS keys, OpenAI `sk-`, Google `AIza`,
PEM private-key headers) across the current tree and full `git log --all -p`
history found nothing. Not exhaustive — see Unknowns.

**Billing (criterion #9):** `frontend/src/app/api/billing/{checkout,portal,
webhook,me}/route.ts` all exist with tests (`webhook/__tests__/route.test.ts`
exercises the generic-error-response CodeQL fix, confirmed in §... wait, see
§ below). Genuinely implemented, not half-wired, as far as the code goes.
Whether the configured Stripe keys are live or test mode is something only
you can confirm (Unknowns).

## 6. The four CodeQL fixes — verified present

| Fix | Location | Verified |
|---|---|---|
| Generic error response, billing webhook | `frontend/src/app/api/billing/webhook/route.ts:63-64` — `return new Response("Handler error", { status: 500 })` | ✅ |
| Generic error response, LLM route | `frontend/src/app/api/llm/route.ts:48-50` — `{ error: "Upstream LLM providers unavailable" }`, no raw error leaked | ✅ |
| Generic error response, transcribe route | `frontend/src/app/api/transcribe/route.ts:39-41` — `{ error: "Transcription failed" }` | ✅ |
| Bounded timeout clamp | `frontend/src/lib/llmCascade.ts:80` — `Math.min(Math.max(0, Number(ms) \|\| 0), MAX_TIMEOUT_MS)` | ✅ |

No regressions found.

## 7. Severity counts

- P0: 2 (F-01, F-02)
- P1: 2 (F-03, F-04)
- P2: 4 (F-05, F-06, F-07, F-10)
- P3: 2 (F-08 — done, F-09)

## 8. Critical path to live (ordered)

1. **Decide F-01** (retire vs. deploy the backend) — everything about "target
   hosting" and criteria #3/#4 depends on this answer.
2. **F-02** — reconcile the split Supabase migrations; confirm RLS hardening
   is actually applied to the live DB.
3. **F-04** — schedule the Next.js 14→16 migration to close the 2 high CVEs
   (real project, don't rush it into this pass).
4. F-03, F-06, F-07, F-10, F-09, F-05 in any order — none block going live,
   all are cheap.
5. Re-run the full Definition-of-Live checklist (§ below) once F-01/F-02 land.

## 9. Definition-of-Live — current pass/fail

| # | Criterion | Status |
|---|---|---|
| 1 | `main` builds clean from fresh clone | ✅ PASS (frontend verified this session; backend verified in a fresh venv) |
| 2 | Frontend loads over HTTPS, no console errors | ⚠️ UNVERIFIED — needs a real browser check against the live URL, which this sandbox cannot reach (egress-blocked to the production domain) |
| 3 | Backend deploys, `/health` returns 200, OpenAPI loads | ❌ FAIL — not deployed anywhere (F-01) |
| 4 | Frontend↔backend round-trip in production | ❌ FAIL — the only wire is dead (F-01) |
| 5 | Supabase migrations applied & reproducible | ❌ FAIL for 5 of 11 migration files (F-02) |
| 6 | Auth end-to-end in production | ⚠️ UNVERIFIED — same egress block as #2; code review says it should work (NextAuth + Google, independent of the dead backend bridge) |
| 7 | Every required env var documented + validated at boot | ✅ PASS for backend (`Settings` fields with no default raise a clear `ValidationError` at boot) — ⚠️ PARTIAL for frontend, which has no equivalent single boot-time validator (env vars are read ad hoc per route; a missing one degrades a feature rather than failing loudly) |
| 8 | No committed secrets | ✅ PASS (pattern scan, not exhaustive — see Unknowns) |
| 9 | Billing fully working (test) or safely disabled | ⚠️ UNVERIFIED — code is real and complete; live-vs-test key mode needs your confirmation |
| 10 | Rollback procedure exists and tested | ❌ Not found — no rollback runbook anywhere in the repo |

## 10. Unknowns — what I couldn't verify, and what I'd need

- **Supabase `list_migrations` on the live project** — the tool call
  required an approval that didn't come through in two attempts. I have
  `list_tables` confirming all 22 public tables have RLS *enabled*, but not
  which migration files actually produced that state, or whether the 5
  stranded `frontend/supabase/migrations/*` files were ever run by hand.
  **Need:** approve that MCP call, or run `supabase migration list --linked`
  yourself against project `cnbxarfuyicyjbtvbmtv`.
- **Whether Stripe keys are live or test mode** — I can see the routes exist
  and are tested; I did not and should not read the actual key values.
  **Need:** you confirm from the Vercel env var dashboard.
- **Whether `BACKEND_URL` is set to anything real in Vercel's env vars** —
  I checked for a *second deployed project* and found none, which is strong
  evidence, but I didn't enumerate Vercel's env var values for the frontend
  project directly. **Need:** you check, or grant access to read (not just
  list) that project's env vars.
- **Full secret-history scan** — my git-history scan was pattern-based
  (common key prefixes, PEM headers), not a dedicated tool like
  `gitleaks`/`trufflehog`. **Need:** run one of those for full assurance;
  I can do this myself next pass if you want it before Gate 1 closes.
- **Domain** — not yet told what to confirm here (⬅ CONFIRM in the brief was
  left blank). Currently serving from `the-third-eye.anchit-tandon.com` per
  code references; confirm this is the intended production domain.
- **Target hosting for the backend** — genuinely can't recommend Railway vs.
  Fly vs. Render vs. Vercel Python functions until F-01 is decided; if the
  answer is "deploy it," I'll research and justify one, with real
  zero-traffic pricing, before touching anything.

---

**GATE 1.** Nothing has been fixed. Waiting for: (a) the F-01 decision, (b)
which severities to approve for Phase 2, (c) answers to whatever Unknowns you
can resolve on your end.
