# DEVELOPMENT.md — How The Third Eye is built

A current, code-level development guide for The Third Eye — a personal AI
operating system. It documents **how** the app is put together and **why** the
load-bearing decisions were made, including the work layered on after the
original `ARCHITECTURE.md` was written.

- `README.md` — setup + product overview (start here).
- `ARCHITECTURE.md` — the original architecture writeup (base layer; predates the
  mode runtime, Studio, agent-safety and data-layer-hardening work below).
- `CLAUDE.md` — repo conventions.

> App code lives in `frontend/` (Next.js). Paths below are relative to `frontend/`.

---

## 1. What it is

One assistant with six personas — **JARVIS / FRIDAY / E.D.I.T.H. / ULTRON /
ZEUS / ATHENA** (`hooks/useAgentProfile.ts`'s `PRESETS`) — sharing one
tool-calling backend: tasks, notes, goals, knowledge-base RAG, web /
news / weather / stocks, calendar, email, reminders, multi-agent reasoning,
translation, vision, live capture, and a Studio of generators. Same capabilities
underneath; the persona changes tone + voice. Only JARVIS is named in the
product's own marketing copy — the other five are real, selectable, and
otherwise undocumented outside this file and the code itself.

---

## 2. Tech stack & platform

- **Framework:** Next.js 14 (App Router, TypeScript, React) — `frontend/`.
- **Auth:** NextAuth v4, **Google only**, **JWT** sessions. The login request is
  identity only (`GOOGLE_SIGNIN_PARAMS`: `openid email profile`,
  `prompt=select_account`, `access_type=online`). The button is a form POST to
  `/api/auth/signin/google` (not `signIn()`), so the state cookie is set on that
  navigation and is still there when Google returns. Gmail and Calendar are not on
  that screen. They are the separate Settings → Connections grant
  (`CONNECT_SCOPES`), because those scopes are still under Google's review and
  asking for them at sign-in blocks everyone who is not a test user. The identity
  the app keys on is `session.user.email` (the Google address). A refresh token is
  stored only when the connect step actually returns a feature scope.
- **Data:** Supabase Postgres (project `hlcjghpzxzatgjfwcoav`) with **pgvector** for
  memory/RAG, reached server-side through `lib/db.ts` (`pg`). The browser never talks
  to the database, and Supabase's Data API is locked out of it (see §4).
- **LLM:** a 7-provider server-side cascade (`lib/llmCascade.ts`) — openai →
  anthropic → gemini → grok → groq → cerebras → ollama — with quota fallback. The
  assistant loop uses Gemini function-calling and falls back to the cascade.
- **Styling:** Tailwind; a HUD/arc-reactor visual language. Three.js + GSAP for the
  cinematic layer.
- **Hosting:** Vercel (Root Directory = `frontend`). `vercel.json` sets
  `git.deploymentEnabled: { main: true }` (auto-deploy on `main`) and the cron jobs.
- **Mobile:** installable PWA + Capacitor scaffolding.

---

## 3. The agent tool-loop (`app/api/chat/route.ts`)

The assistant is a real tool-calling agent, not a chat box. `/api/chat` streams a
Gemini function-calling loop (`generateContentStream`) with ~25 tools:
`get_current_time`, `remember`, `web_search`, `get_weather`, `create/update/delete_task`,
`search_tasks`, `create/delete_note`, `search_notes`, `create/update/delete_goal`,
`search_knowledge`, `get_calendar_events`, `read_emails`, `send_email`,
`get_location`, `get_news`, `translate`, `stock_quote`, `nearby`,
`set/list/cancel_reminder`, `multi_agent_run`, and `create_asset` (Studio).

Key behaviours:
- **Confirm-then-act.** World-changing tools (`isSensitive`, e.g. `send_email`) are
  not run silently — the stream emits a `confirm` event and waits for the user.
- **Honest status reporting.** The system prompt hard-gates the model to report only
  what tool results actually confirm (drafted ≠ sent, queued ≠ published).
- **Prompt-injection defense.** Ingested content (emails, docs, search results) is
  treated as data, never instructions.
- **Undo.** Agent-created items surface a short-lived Undo in the client
  (`hooks/useAgentActions.ts`).
- **Streaming SSE** with a text/`tool`/`confirm`/`done`/`error` event protocol; on
  a Gemini failure it falls back to a plain-text answer via `llmCascade`.
- **Server-derived identity.** Email + OAuth token come from the server session, not
  the request body, so a caller can't act as another user. Metering via `consume()`.

Personas (`hooks/useAgentProfile.ts`) inject their persona into the system prompt and
drive a matching TTS voice.

**MCP client** (`lib/mcp/client.ts`): lets the assistant call tools it doesn't
implement itself, via server-configured (never user-supplied) MCP servers
over HTTP — `tools/list`/`tools/call` only, deliberately narrow to avoid
SSRF via a user-controlled server URL. Tool schemas live separately in
`lib/tools/schemas.ts` so the hand-written and MCP-discovered tool lists
can merge into one function-calling declaration.

---

## 4. Data layer — RLS-safe by construction

The browser never talks to the database. **All client reads/writes go through one
server route**, `app/api/data/[entity]/route.ts`:

- Authenticates via the NextAuth session; queries scoped to
  `user_id = <session email>`; scrubs any client-supplied `user_id`.
- `lib/db.ts` (`getDb()`) is a `pg` pool on `DATABASE_URL` behind the same
  `from().select().eq()` / `rpc()` builder surface the code was written against
  (it was supabase-js), returning `{ data, error, count }` with Postgres SQLSTATE
  codes and never throwing. It connects as the table owner, so RLS policies do
  not apply to it — every query must filter by `user_id` itself. Supabase hosts
  connect over TLS verified against Supabase's root CA (`lib/pgConnection.mjs`),
  since `sslmode=require` means verify-full to `pg` and that root is not in Node's
  trust store.
- Entity allowlist: `tasks`, `team_members`, `notes`, `goals`, `knowledge_docs`,
  `expenses`.
- Client hooks (`useLocalTasks/Notes/Goals/Knowledge/Expenses`) go through
  `lib/dataClient.ts`, which falls back to **localStorage** when not signed in (401)
  or `DATABASE_URL` is unset (501) — so the app still works offline/unconfigured.
- **Schema** is applied by `frontend/scripts/migrate.mjs`, the first step of
  `npm run build`: `supabase/platform-compat.sql` (creates the Supabase
  roles/`auth.jwt()` the files reference only where they are missing — local
  Postgres, CI), then `supabase-schema*.sql`, then `supabase/migrations/*.sql` in
  order, each once, tracked in `public.app_migrations`, then
  `supabase/lockdown.sql` on every run (revokes `anon`/`authenticated` from the
  `public` and `kolab` schemas and enables RLS on every table, so the publishable
  key reaches nothing through `/rest/v1` or `/graphql/v1`). The Supabase CLI's
  `db push` is not the migration path: it applies only `supabase/migrations/`,
  which assume the base `supabase-schema*.sql` tables already exist. It runs only on production builds (previews share the
  production database) and is skipped without `DATABASE_URL`. The RLS policies in
  those files are kept but inert under the owner connection. A **Cloud synced /
  Local only** badge (`components/layout/CloudSyncBadge.tsx` + `/api/sync-status`)
  surfaces which mode you're in so a missing `DATABASE_URL` isn't a silent
  data-loss trap.
- Integration tests: `TEST_DATABASE_URL=postgres://… npm test` runs the
  `*.integration.test.ts` files against a migrated database —
  `schema.integration.test.ts` checks every table, selected column and `rpc()`
  function the code uses exists and that the API roles have no grants;
  `phoneAuth.integration.test.ts` runs sign-up, sign-in and the PIN lockout. The
  closest local stand-in for production is the real Supabase image:
  `docker run -d -p 54322:5432 -e POSTGRES_PASSWORD=pw supabase/postgres:17.6.1.104`,
  then `DATABASE_URL=postgres://postgres:pw@localhost:54322/postgres node scripts/migrate.mjs`.

### 4a. Moving an existing workspace onto a phone identity

**Read this before signing in by number on a deployment that has real data.**

`user_id` is whatever sign-in put in `session.user.email`. Under Google that was
an email address; under phone sign-in it is an E.164 number. They are *different
identities*, so a phone account starts empty and **the data keyed by the old
email is not reachable from it** — and since Google is no longer a sign-in
provider, once the existing 24-hour JWT expires there is nothing that can produce
the email identity again either.

There is no automatic link, on purpose: silently merging two identities is a
worse failure than an obvious empty workspace. Re-key deliberately instead, once,
against the database (Supabase SQL editor), **before** putting anything into the
new account so nothing collides:

```sql
-- Substitute your own two values. Run once.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'user_id'
  LOOP
    EXECUTE format('update public.%I set user_id = $1 where user_id = $2', t)
      USING '+919876543210', 'you@example.com';
  END LOOP;
END $$;
```

It walks every `public` table with a `user_id` column, so it covers tables added
since this was written. Two things to know:

- **Order matters.** `google_tokens.user_id` is a primary key and several tables
  are unique on `(user_id, …)`, so if the phone identity already has rows the
  update raises a conflict. Re-key first, use the account after.
- **Stripe.** `profiles.stripe_customer_id` moves with the row, so an existing
  subscription follows; but the `metadata.email` on the Stripe subscription
  itself still holds the old address, which only matters if you reconcile by it.

---

## 5. Cortex — RAG + memory (pgvector)

`lib/cortex.ts` + `/api/cortex/*`: uploaded docs and past exchanges are embedded into
Postgres pgvector. The chat route does semantic recall (`retrieveMemories`) and
document search (`searchChunks`), and persists each exchange (`rememberExchange`,
best-effort/non-blocking). The Knowledge page does real semantic search with a
relevance % and falls back to keyword search when embeddings aren't configured.

---

## 6. Mode-aware runtime (ported from "Mirror")

`hooks/useMode.ts` — a **Personal / Professional / Enterprise** runtime persisted to
localStorage and broadcast via a window `CustomEvent` + `storage` event, so the
sidebar switcher, assistant, and every mode-aware surface stay in sync without a
provider.

- The active mode injects a per-mode block into the chat system prompt so the
  assistant re-prioritises (life vs execution vs strategy).
- **Mode-scoping** (`hooks/useModeTags.ts` + `filterByMode` + `ModeScopeToggle`):
  Tasks, Notes, Goals, Knowledge and Finance filter to the active mode via a
  client-side `itemId → mode` tag overlay (no DB migration; untagged/legacy items
  show in every mode so nothing disappears). New items are auto-tagged to the active
  mode.

---

## 7. Studio — per-mode generators

`/tools` (hub) + `/tools/[tool]` + `/api/tools/generate` + `lib/studioGenerate.ts`.
Generators, all powered by the shared `llmCascade` (no new keys):

- **Landing Page Engine** (Professional) → complete responsive HTML page.
- **HTML Mailer Architect** (Professional) → email-client-safe table-based mailer.
- **Lifecycle OS** (Enterprise) → stage-by-stage CRM lifecycle plan.
- **Creative Studio** (Personal) → lyrics / Suno-Udio prompt / poem / captions.
- **Music Studio** (Personal, `components/studio/MusicStudio.tsx` +
  `/api/tools/music/infer`) → structured track-brief form (genre, mood,
  instrumentation, etc.) with per-field AI autofill. Autofill matching
  (`matchOption`/`matchOptions`) prefers the most specific option over the
  first substring match, and splits a blended AI response into separate
  chips for multi-select fields instead of collapsing to one.
  Generation runs the four-agent pipeline in `lib/music/agents.ts` (`planSong`).
  The form's BPM (40–400) is authoritative and leads the song model's tags;
  song structures come per genre from `lib/music/structures.ts`, and their
  sections become the lyric's section tags. AI values are cleaned by
  `lib/music/normalize.ts`.
  **Daily drop** (`lib/music/daily.ts`): "Save as my daily style" stores the
  form in `music_daily`; the daily cron (`/api/cron/dispatch`, job `music`)
  makes one new track per user per day and hands it to Replicate with a
  webhook (`/api/tools/music/daily/webhook`). The audio is kept in Postgres
  (`music_daily_chunks`, 1 MiB chunks, last 7 days) because Replicate deletes
  outputs within the hour, and it is served by byte range
  (`/api/tools/music/daily/[id]`) because a Vercel response can't exceed
  4.5 MB. It needs `REPLICATE_API_TOKEN` and a production URL (`NEXTAUTH_URL`)
  that Replicate can reach.

Each shares `StudioWorkbench` (form → generate → HTML iframe / Markdown preview, with
Copy / Download / **Save to Knowledge** — the saved doc is mode-tagged). The same
engine is exposed to the assistant as the `create_asset` tool, so "draft a Diwali
mailer" works by voice/chat and saves to the Knowledge base.

## 7a. App Hub

`components/apps/AppHub.tsx` + `lib/apps/registry.ts` — a directory of 100
apps for the active mode: 24 self-built tools (`selfBuilt: true`, run
on-device, tagged to the device ID via `lib/deviceVault.ts`) mixed with 76
third-party deep-links. An **All apps / My apps** tab filters down to just
the self-built ones so they don't get buried in the third-party directory.

---

## 8. Live Capture & Vision

- **Live Capture** (`components/capture/CaptureContext.tsx` + `/api/capture/extract`):
  continuous Web Speech API transcription, LLM extraction of tasks/reminders/ideas
  every ~20s, conversation-type classification, and **auto-create** of tasks into the
  Tracker (with an undo log). A **screen Wake Lock** keeps the mic alive mid-session.
  Honest limit: browsers can't capture audio when the tab is hidden / screen is off —
  true background capture needs a native agent.
- **Vision** (`/api/vision` + `components/assistant/VisionButton.tsx`): a shared
  screen or webcam frame → Gemini multimodal (E.D.I.T.H.-style).
- `/api/transcribe` (Whisper) exists for server-side audio transcription.

---

## 9. Ingestion — inbox → tasks

`lib/ingest.ts` + `lib/tasks.ts` + `/api/cron/scrape-gmail` + `/api/ingest/run`:

- Cron (GitHub Actions every 3 h, plus a daily Vercel cron), `IngestBridge` on app
  open/focus, and an on-demand "Scan now" pull unread Gmail from the last 2 days, run
  it through the LLM extractor, and dual-key **dedup/merge** into the `tasks` table
  (`dedupe_hash` + `normalize_heading` + owner match; owner-less tasks match on
  `spoc IS NULL`).
- Requires the "Connect Google" opt-in + `DATABASE_URL` + `TOKEN_ENCRYPTION_KEY`; the
  Live Capture page surfaces connection status + a Scan-now with a result count so
  silent no-ops are visible.
- Google Chat ingestion was removed (Oct 2026) to drop its restricted scope from OAuth
  verification. The `conversation_sources` table is left in place; account deletion
  still clears it.

---

## 10. Agent safety layer

`lib/agentControl.ts` + `/activity`:

- A global **kill switch** (`isAgentKilled` / `setAgentKilled`) the action layer
  respects before running anything.
- An **append-only, exportable audit log** of every action the agent takes (capped,
  localStorage-backed, reactive via a window event).
- Surfaced on the `/activity` page and a dashboard widget (which flips red to
  "Halted" when the kill switch is on).

---

## 11. Front-end & dashboard

- **Cinematic layer:** Three.js arc-reactor hero (`components/landing/HeroCanvas`,
  `components/dashboard/ReactorCanvas`) and GSAP scroll-reveals — lazy-imported,
  DPR-capped, disposed on unmount, `prefers-reduced-motion`-aware, paused on hidden
  tabs.
- **Command Center:** the dashboard surfaces every feature as a live widget
  (`components/dashboard/DashboardWidgets.tsx`) with real counts.
- **Shell:** sidebar (nav + mode switcher + cloud-sync badge), auth-guarded routes via
  `middleware.ts`, PWA (`sw.js`, `manifest`).

---

## 12. Entitlements & billing

`lib/entitlements.ts` — tiers, `PREMIUM_TOOLS`, per-day limits, `PAYWALL_MESSAGE`.
Launch mode treats everyone as premium (badged, not gated). Reminders/usage persist
to the database.

---

## 13. Build / deploy / CI

- **Build:** `npm run build` in `frontend/` — `scripts/migrate.mjs`, then `next build`.
- **Deploy:** Vercel, Root Directory `frontend`, auto-deploy on `main`
  (`vercel.json`). Env: `GEMINI_API_KEY` (+ other provider keys),
  `GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
  `DATABASE_URL` (Supabase transaction pooler, port 6543) + `DATABASE_URL_UNPOOLED`
  (session pooler, port 5432 — migrations take an advisory lock, which needs a
  session; the direct `db.<ref>.supabase.co` host is IPv6-only and unreachable
  from Vercel),
  `TOKEN_ENCRYPTION_KEY`, `SERPER_API_KEY`.
- **OAuth redirect URIs** to whitelist in Google Console:
  `…/api/auth/callback/google` (sign-in) and `…/api/connect/google/callback`
  (Gmail/Chat connect).
- **CI:** CodeQL + a Strix security scan (pinned install, not `curl | bash`) on every
  PR. Migrations are applied by the production build, not by CI.
- **Rollback.** No automated rollback pipeline exists — this is the manual procedure:
  - **Bad app deploy (frontend code).** Vercel keeps every deployment. In the
    Vercel dashboard → Deployments, find the last known-good one and use
    "Promote to Production" — this repoints the production alias immediately,
    with no rebuild and no git changes required. Equivalent via CLI:
    `vercel rollback [deployment-url]`. This does not touch the database, so
    it's always safe to do first while diagnosing.
  - **Bad migration (schema change).** Migrations in `supabase/migrations/`
    are forward-only by convention — there are no paired `down` scripts.
    Write and commit a new migration that reverses the specific change (drop
    the column/table/policy just added), rather than editing or deleting the
    original file; `public.app_migrations` tracks applied files by path, and
    removing a file that already ran desyncs the ledger from the live
    database. If the change is destructive (dropped a column with data in
    it), restore from a Supabase backup (point-in-time recovery on paid plans) instead, then reapply
    migrations up to (not including) the bad one.
  - **Bad env var / secret rotation.** Vercel → Settings → Environment
    Variables keeps no built-in history; before changing a production value,
    copy the current one somewhere safe first. A deploy always reads env vars
    at build time, so reverting a value still needs a redeploy (or use
    "Redeploy" on the last-good deployment after fixing the variable).
  - **Verify after any rollback:** hit `/api/status` (`ai`, `database`,
    `google_oauth`, and the per-provider `cascade` booleans should read
    `true` for whatever's configured) and confirm sign-in + one chat message
    round-trip in production before considering the incident closed.

---

## 14. Where to make common changes

| I want to… | Go to |
|---|---|
| Add/adjust an assistant tool | `app/api/chat/route.ts` (declaration + `runTool` case) |
| Add a persisted entity | `app/api/data/[entity]/route.ts` allowlist + a `useLocal*` hook |
| Change providers/order | `lib/llmCascade.ts` |
| Add a Studio generator | `lib/studioTools.ts` + `lib/studioGenerate.ts` |
| Tune mode behaviour | `hooks/useMode.ts` + the mode block in `/api/chat` |
| Change ingestion dedup/merge | `lib/tasks.ts` / `lib/ingest.ts` |
| Adjust RLS/policies | `supabase/migrations/*_rls_hardening.sql` |
| Agent safety (kill switch/log) | `lib/agentControl.ts` + `/activity` |
| Add a nav item / dashboard widget | `components/layout/Sidebar.tsx` / `DashboardWidgets.tsx` (+ `middleware.ts`) |
