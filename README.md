# The Third Eye

A personal AI operating system: one tool-calling assistant (four personas —
**JARVIS / FRIDAY / E.D.I.T.H. / ULTRON**) backed by tasks, notes, goals,
knowledge-base RAG, calendar/email, live voice capture, vision, and a Studio
of generators (including Music Studio) — plus an "All apps" hub of 24
self-built tools and 76 linked third-party apps.

Live product: **Next.js 14 + Supabase**, deployed on Vercel. See
[DEVELOPMENT.md](DEVELOPMENT.md) for the real, current architecture — start
there, not `ARCHITECTURE.md` (see note below).

> **Note on `backend/`:** this repo also contains a separately-developed
> FastAPI + agents + RAG backend (`backend/`, described in
> [ARCHITECTURE.md](ARCHITECTURE.md)). It is well-tested but **not deployed
> anywhere** and the live frontend does not call it — the frontend talks
> directly to Supabase and the AI providers instead. The retire-vs-deploy
> question is decided (2026-08-22, [AUDIT.md](AUDIT.md) F-01): deploy it on a free stack (Supabase schema, Upstash Redis, Cloud Run scale-to-zero); code done, the deploy itself is blocked on `gcloud` auth and a free Upstash signup.
> Steps are in [PROJECT_STATUS.md](PROJECT_STATUS.md). Until that runs,
> don't build against `backend/` expecting it to be live.

## Quick Start (the live product)

```bash
cd frontend
npm install
cp ../.env.example .env.local   # fill in the keys DEVELOPMENT.md §13 lists
npm run dev
open http://localhost:3000
```

Minimum env vars to get a working dev session: `GEMINI_API_KEY`,
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`,
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Full list and
what each one gates: [DEVELOPMENT.md §13](DEVELOPMENT.md#13-build--deploy--ci).

## Buying credits (Razorpay, India)

Credit packs (`BUNDLES` in `frontend/src/lib/billing/plans.ts`, priced in INR)
are sold with Razorpay Standard Checkout as one-time orders. Visitors whose
`x-vercel-ip-country` is `IN` (or with no country header, i.e. local
development) get Razorpay on **Plans → Credit packs**; elsewhere packs stay
unavailable for now. Stripe still runs the subscription checkout.

Flow: `POST /api/billing/razorpay/order` creates the order with the amount in
paise from the catalog (never from the browser) and stores a pending row in
`razorpay_purchases` → the page loads `checkout.js` on tap and opens it in
redirect mode → Razorpay posts the result to `/api/billing/razorpay/callback`,
which checks HMAC-SHA256(`order_id|payment_id`) with the key secret, then
`GET /v1/payments/{id}` (same order, same amount, captured; it captures an
authorized payment) and credits the wallet → 303 to `/plans#paid` or
`#unpaid`. `/api/billing/razorpay/verify` does the same for the in-page
handler, and `/api/billing/razorpay/webhook` (`order.paid`,
`payment.captured`, signed with `X-Razorpay-Signature`) catches payments whose
browser never came back. All three credit through `grant_razorpay_purchase`,
which credits each order once and each payment id once.

| Env var | What it is |
| --- | --- |
| `RAZORPAY_KEY_ID` | Key id (`rzp_test_…` / `rzp_live_…`); sent to the browser to open checkout |
| `RAZORPAY_KEY_SECRET` | Key secret; server only, signs API calls and checks payment signatures |
| `RAZORPAY_WEBHOOK_SECRET` | Secret of the webhook pointing at `https://<host>/api/billing/razorpay/webhook` |

Without the key pair, packs fall back to the old behaviour (owner accounts buy
for free, everyone else is told payments are not live). Test with card
`4100 2800 0000 1007`, any future expiry, CVV `123`, contact `9000090000`, then
**Success** on the demo bank page.

## Prerequisites

- Node 22, npm
- A Supabase project (Postgres + pgvector) — see `supabase/migrations/`
- Google Cloud project with OAuth 2.0 credentials (sign-in)
- A Gemini API key (free tier works) — the assistant loop's primary model

## Architecture

- [DEVELOPMENT.md](DEVELOPMENT.md) — how the live product is actually built. Start here.
- [ARCHITECTURE.md](ARCHITECTURE.md) — the original `backend/` design + ADRs (not deployed; see note above).
- [AUDIT.md](AUDIT.md) — latest inventory and open findings.

## Optional: `backend/` (not required for the live app)

```bash
cd backend
pip install -e ".[dev]"
cp ../.env.example .env
alembic upgrade head
uvicorn app.main:app --reload
pytest --cov=app -v
```

## Security

- Secrets live in environment variables only; RLS enforced on every
  Supabase table (`supabase/migrations/*_rls_hardening.sql`).
- Server-derived identity on every data route — a request can't act as
  another user (see `DEVELOPMENT.md` §4).
- World-changing assistant tools (e.g. sending email) require an explicit
  user confirmation before running.
- An append-only, exportable agent activity log plus a global kill switch
  (`/activity`).
- CodeQL + Strix security scanning run in CI on every PR.
- See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## Disclaimer

The Third Eye is a personal productivity assistant, not a licensed
financial, medical, or legal advisor. Any billing, expense, or "financial"
surfaces provide organization and visualization only.
