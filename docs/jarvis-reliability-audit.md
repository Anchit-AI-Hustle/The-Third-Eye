# JARVIS reliability audit

Scope: the live assistant, `frontend/src/app/api/chat/route.ts` and what it calls.
`backend/` is not deployed and was not audited here (see PROJECT_STATUS.md).

## Execution pipeline

1. **Request.** `POST /api/chat`. Identity comes from the server session
   (`lib/serverIdentity`), never the body. Kill switch (`lib/agentGuard`) and
   metering (`lib/usage`) run first.
2. **Context.** Tasks, notes, goals and expenses are read from the database for
   that user (`storedLists`), memory and RAG hits are added (`lib/cortex`), the
   prompt is normalized (`normalizePrompt`: dates resolved, compound intents
   listed). An open checklist from the previous reply is carried over.
3. **Direct turns.** "Open X" and "email a@b ..." are answered without a model.
4. **Tier 1: Gemini function calling.** Up to 8 rounds (30 with a checklist),
   bounded by a deadline 15 s inside `maxDuration` (60 s).
5. **Tier 2: OpenAI-compatible tool calling** (`toolCallCascade`, Groq first)
   when Gemini is missing, benched or fails. Same round limits.
6. **Tier 3: text-only cascade** (`llmCascade`) with a "no tool access" override,
   so it cannot claim actions.
7. **Tools** run through one `execute()`: checklist calls go to the ledger
   (`lib/checklist.ts`), sensitive calls emit `confirm` and wait for the user
   (`lib/actions.ts`, executed later by `/api/act`), everything else runs in
   `runTool`. Side effects (task/note creation etc.) are returned in the `done`
   event and applied by the client (`hooks/useAgentActions.ts`) or, for
   WhatsApp and Autopilot, server-side (`lib/whatsapp.ts applySideEffects`).
8. **Completion.** The checklist ledger only ticks a step after a successful
   tool result while it was active. `shortfall()` lists open steps at the end.
9. **Task autopilot.** `components/tasks/TaskAutopilot.tsx` claims a new task
   (`/api/tasks/autopilot`, conditional update so one tab wins), runs it through
   `/api/chat`, and `judgeRun` marks it done only when every step was verified.

## Defects found and fixed in this pass

| # | Severity | Defect | Root cause | Evidence / reproduction | Status |
|---|---|---|---|---|---|
| R1 | High | Malformed tool arguments ran anyway | Tier 2 `parseArgs` turned invalid JSON into `{}` and executed the tool with defaults | `eval.route.test.ts` scenario 6 fails on the old code | Fixed: `lib/tools/args.ts parseToolArgs`; rejected calls do not run |
| R2 | High | No argument validation at the tool boundary | Declarations had `required` and `enum`, nothing enforced them | Scenario 6; `checklist.route.test.ts` "rejects a call missing a required argument" | Fixed: `checkArgs` in `execute()` for both tiers |
| R3 | High | A failed step could be ticked done | `classifyResult` read "No goal matching ...", "Please provide ...", "X could not ...", "I need a ..." as success, so `complete_step` accepted it | Scenario 18 fails on the old code (step 2 ticked after a failed goal update); `checklist.test.ts` new case | Fixed: classifier covers those phrasings |
| R4 | High | Failures hidden when no checklist was planned | Nothing tracked failed tools outside the ledger; the model's closing text was the only report | Scenarios 10 and 17 fail on the old code ("Your flight is booked!" after an unknown tool) | Fixed: `failures` map, "Not completed" note, `done.failed` |
| R5 | Medium | Empty Gemini closing round said "Done." after failures | `checklist.shortfall() ?? "Done."` ignored failed tools | Code path, covered by the same `openGap()` | Fixed |
| R6 | Medium | Cancelling did not stop the loop | No check of `req.signal` or stream cancel; further rounds and tool calls ran after the user stopped | Scenario 15 fails on the old code | Fixed: `cancelled` flag stops rounds and tool calls |
| R7 | Medium | A hung Gemini call could outlive the function | `generateContentStream` had no timeout | Code inspection (SDK `SingleRequestOptions.timeout`/`signal`) | Fixed: timeout bounded by the deadline, plus the request signal |
| R8 | Medium | Untitled tasks and empty notes were created | `manage_tasks`/`manage_notes` create had no input check | `tools.route.test.ts` "will not save an untitled task" | Fixed |
| R9 | Medium | Autopilot task stuck "running" forever after a tab closed | Runner skipped any task with a status; only the claim route knew about staleness | `TaskAutopilot.test.tsx` "retries a task left running" | Fixed: shared `STALE_MS`, stale runs re-picked |
| R10 | High | Primary model failing after tools ran restarted the whole task on the fallback model | Tier 2 rebuilt the conversation from the user's message, so tools ran a second time | `checklist.route.test.ts` "does not start the task again" | Fixed: ends as `partial`, naming what ran |
| R11 | Medium | Cancel could still run tier 3 and save memory | `controller.close()` threw after cancel, which fell into the fallback tiers | Review trace | Fixed: safe `close()`, early return when cancelled |
| R12 | Medium | A success on one action hid a failure on another of the same tool | Failures keyed by tool name only | eval 17b | Fixed: keyed by tool and action |
| R13 | Low | First draft of the classifier marked a queued device action and empty searches as failed | Over-broad patterns ("do not claim", "found matching") | `checklist.test.ts` ok cases | Fixed before commit |

Earlier fixes in this series (PRs #412, #413 and the stacked A-G branches) are
recorded in their PR descriptions: data read from the database instead of the
request body, tool exceptions caught, seeded fake contacts removed, per-user
local caches, honest dashboard status, KYC and link validation, device control
results reported as they happened.

## Verified not to be defects

- **Retries are bounded.** Each provider call has a 30 s timeout
  (`llmCascade withTimeout`, capped at 120 s), at most 3 alternates per
  provider, cooldown after 429/5xx, and the loop deadline. Scenario 7 shows an
  all-providers outage ends in one `error` event within 6 provider requests.
- **Approval cannot be bypassed from chat.** Sensitive tools never reach
  `runTool`; `/api/act` re-checks `isSensitive` and the premium gate.
  Scenarios 13 and 14 (including an injected instruction in a stored note).
- **Duplicate execution.** Confirm cards run once (`useAgentConfirm` status
  guard), WhatsApp deliveries are deduplicated by message id, autopilot claims
  are a conditional update (`/api/tasks/autopilot` test "lets only one tab
  claim a task"). Two identical chat requests are two turns by design.

## Open findings (not fixed here)

See `jarvis-verification-report.md`, "Known limitations".
