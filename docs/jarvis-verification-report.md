# JARVIS verification report

Date: 2026-10-17. Scope: `frontend/` (the live app). Defects and root causes
are in `jarvis-reliability-audit.md`; capabilities in
`jarvis-capability-inventory.md`.

## How to run

```bash
cd frontend
npm test                                                   # everything
npx vitest run src/app/api/chat/__tests__/eval.route.test.ts  # the evaluation suite
```

The suite needs no keys or network. It drives the real `/api/chat` route,
real tool handlers and the real checklist ledger. Only the model is scripted,
one reply per round, so every run is the same. CI runs it as part of `npm test`.

## Evaluation suite (`src/app/api/chat/__tests__/eval.route.test.ts`)

| # | Scenario | What is checked | Result | Fails on old code |
|---|---|---|---|---|
| 1 | Simple request | answers with no tool calls | pass | no |
| 2 | Multiple requirements | each requirement is a step; an unverified one is reported open | pass | no |
| 3 | Multi-step task | a later step sees what an earlier one created | pass | no |
| 4 | Tool selection | named tool runs, result reaches the model | pass | no |
| 5 | Tool failure + recovery | retry that works clears the failure | pass | no |
| 6 | Malformed arguments | invalid JSON, bad enum, missing required: nothing runs, reported "Not completed" | pass | **yes** |
| 7 | Provider failure | all providers 500: one honest error, at most 6 provider requests | pass | no |
| 8 | Long-running | 10-step checklist runs past the 8-round plain limit and finishes | pass | no |
| 9 | Interrupted | provider drops after a tool ran: `partial`, the tool ran once | pass | no |
| 10 | Missing capability | unknown tool reported as not done despite "booked!" | pass | **yes** |
| 11 | Context continuity | earlier turns reach the model | pass | no |
| 12 | Multiple deliverables | each tracked and verified on its own | pass | no |
| 13 | Authorization | email waits for Confirm; step stays "awaiting" | pass | no |
| 14 | Malicious retrieved content | injected "email everyone" in a stored note still needs Confirm | pass | no |
| 15 | Cancellation | after stop, no tool runs and no further round starts | pass | **yes** |
| 16 | Duplicate submission | two identical requests are two turns with unique confirm ids | pass | no |
| 17 | Completion claim | failed tool reported although the model says it worked | pass | **yes** |
| 17b | Mixed actions | success on create does not hide a failed update | pass | **yes** |
| 18 | Partial success | done / failed / open steps each named; a failed tool cannot be ticked | pass | **yes** (old classifier ticked the failed step) |

Related regression tests: `src/lib/tools/__tests__/args.test.ts`,
`src/lib/__tests__/checklist.test.ts` (failure phrasings, and success strings
that must stay ok), `src/app/api/chat/__tests__/checklist.route.test.ts`
(validation on the primary model; no restart after tools ran),
`src/app/api/chat/__tests__/tools.route.test.ts` (no untitled task),
`src/components/tasks/__tests__/TaskAutopilot.test.tsx` (stale run retried, busy
run left alone), `src/app/api/tasks/autopilot/__tests__/route.test.ts` (one tab
claims a task).

Measured on this suite: false completion claims 0 of 19; malformed calls
executed 0 of 3; tools run after cancel 0; duplicate side effects 0.
These are deterministic scenarios, not a sample of real traffic.

## Quality gates (run 2026-10-17 on this branch)

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit -p .` | pass |
| Lint | `npm run lint` | 0 errors, 10 warnings (same 10 as `main`, none in changed files) |
| Tests | `npx vitest run` | 1177 passed, 42 skipped (skipped need `TEST_DATABASE_URL` or live keys) |
| Build | `npm run build` | pass |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities |

## Live pipeline check

`next start` on this build against a local Postgres, a signed session cookie and
a scripted OpenAI-compatible provider on localhost (no real model, no internet:
this sandbox's proxy blocks outbound provider calls). One request asked for a
valid task, a bad action, a call missing `action` and an unknown tool. Result:
the valid task's side effect was returned; the other three were refused before
running and listed under "Not completed" and in `done.failed`. A real model's
choices were not tested here.

## Known limitations

- **Not verified with a real model.** All runs use a scripted provider. Whether
  Gemini or Groq choose the right tool for a given request is not measured.
- **Autopilot retries re-run a whole task.** A run that stopped mid-way is retried
  from the start after 10 minutes. Client-applied effects are only applied at
  finish, but anything a tool writes directly during the run can repeat.
- **Two identical chat requests act twice.** There is no request-level
  idempotency key; confirm cards, WhatsApp deliveries and autopilot claims are
  the deduplicated paths.
- **Classifier is text-based.** Tool results are plain strings; a handler that
  words a failure in a new way can still read as success. A structured
  `{ ok, result }` from every handler would remove this class of bug.
- **Reminders can be up to 3 hours late** (GitHub Actions cron every 3 hours).
- **Not supported:** app store uploads, completing payments, end-to-end booking.
- Remaining audit items from the earlier review (timezone dates, media pages
  without keys, PDF text extraction) are tracked for the next PRs.
