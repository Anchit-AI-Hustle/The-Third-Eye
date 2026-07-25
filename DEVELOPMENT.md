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

One assistant with four personas — **JARVIS / FRIDAY / E.D.I.T.H. / ULTRON** —
sharing one tool-calling backend: tasks, notes, goals, knowledge-base RAG, web /
news / weather / stocks, calendar, email, reminders, multi-agent reasoning,
translation, vision, live capture, and a Studio of generators. Same capabilities
underneath; the persona changes tone + voice.

---

## 2. Tech stack & platform

- **Framework:** Next.js 14 (App Router, TypeScript, React) — `frontend/`.
- **Auth:** NextAuth v4, Google OAuth, **JWT** sessions. Basic sign-in requests only
  `openid email profile`; the sensitive Gmail/Chat scopes are gated behind a
  separate opt-in "Connect Google" flow so login never trips OAuth-verification.
- **Data:** Supabase (Postgres) with **pgvector** for memory/RAG. The browser never
  talks to Supabase directly (see §4).
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

---

## 4. Data layer — RLS-safe by construction

The browser has only the public anon key, and there's no NextAuth→Supabase JWT
bridge, so a direct client would be blocked by RLS. Instead **all reads/writes go
through one server route**, `app/api/data/[entity]/route.ts`:

- Authenticates via the NextAuth session; uses the **service-role** client scoped to
  `user_id = <session email>`; scrubs any client-supplied `user_id`.
- Entity allowlist: `tasks`, `team_members`, `notes`, `goals`, `knowledge_docs`,
  `expenses`.
- Client hooks (`useLocalTasks/Notes/Goals/Knowledge/Expenses`) go through
  `lib/dataClient.ts`, which falls back to **localStorage** when not signed in (401)
  or Supabase is unconfigured (501) — so the app still works offline/unconfigured.
- **RLS is enforced** via a tracked migration (`supabase/migrations/*_rls_hardening`)
  with a `WITH CHECK` owner policy per table; token/ingestion tables are
  service-role-only. A **Cloud synced / Local only** badge
  (`components/layout/CloudSyncBadge.tsx` + `/api/sync-status`) surfaces which mode
  you're in so a missing service key isn't a silent data-loss trap.

---

## 5. Cortex — RAG + memory (pgvector)

`lib/cortex.ts` + `/api/cortex/*`: uploaded docs and past exchanges are embedded into
Supabase pgvector. The chat route does semantic recall (`retrieveMemories`) and
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
Four generators, all powered by the shared `llmCascade` (no new keys):

- **Landing Page Engine** (Professional) → complete responsive HTML page.
- **HTML Mailer Architect** (Professional) → email-client-safe table-based mailer.
- **Lifecycle OS** (Enterprise) → stage-by-stage CRM lifecycle plan.
- **Creative Studio** (Personal) → lyrics / Suno-Udio prompt / poem / captions.

Each shares `StudioWorkbench` (form → generate → HTML iframe / Markdown preview, with
Copy / Download / **Save to Knowledge** — the saved doc is mode-tagged). The same
engine is exposed to the assistant as the `create_asset` tool, so "draft a Diwali
mailer" works by voice/chat and saves to the Knowledge base.

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

## 9. Ingestion — inbox/chat → tasks

`lib/ingest.ts` + `lib/tasks.ts` + `/api/cron/scrape-gmail|scrape-chat` +
`/api/ingest/run`:

- Cron (Gmail every 15 min, Chat offset) and an on-demand "Scan now" pull recent
  messages, run them through the LLM extractor, and dual-key **dedup/merge** into the
  `tasks` table (`dedupe_hash` + `normalize_heading` + owner match; owner-less tasks
  match on `spoc IS NULL`). The Chat watermark only advances after a message is fully
  processed, so a mid-run failure never skips messages.
- Requires the "Connect Google" opt-in (Gmail/Chat scopes) + `SUPABASE_SERVICE_ROLE_KEY`
  + `TOKEN_ENCRYPTION_KEY`; the Live Capture page surfaces connection status + a
  Scan-now with a result count so silent no-ops are visible.

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
to Supabase.

---

## 13. Build / deploy / CI

- **Build:** `npm run build` (Next.js) in `frontend/`.
- **Deploy:** Vercel, Root Directory `frontend`, auto-deploy on `main`
  (`vercel.json`). Env: `GEMINI_API_KEY` (+ other provider keys),
  `GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
  `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `TOKEN_ENCRYPTION_KEY`, `SERPER_API_KEY`.
- **OAuth redirect URIs** to whitelist in Google Console:
  `…/api/auth/callback/google` (sign-in) and `…/api/connect/google/callback`
  (Gmail/Chat connect).
- **CI:** CodeQL. `.github/workflows/supabase-deploy.yml` runs `supabase db push` on
  migration changes (needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` secrets).

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
