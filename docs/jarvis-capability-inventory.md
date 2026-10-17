# JARVIS capability inventory

What the assistant can actually do in the live app, what each needs, and where
it is tested. Declarations: `frontend/src/lib/tools/schemas.ts`. Handlers:
`runTool` in `frontend/src/app/api/chat/route.ts`. "Confirm" means the action
waits for the user's tap (`lib/actions.ts isSensitive`).

| Tool | What it does | Needs | Confirm | Tests |
|---|---|---|---|---|
| plan_checklist, start_step, complete_step, fail_step | Verified checklist ledger | none | no | `lib/__tests__/checklist.test.ts`, `chat/__tests__/checklist.route.test.ts`, eval 2, 8, 12, 18 |
| manage_tasks, manage_notes, manage_goals, manage_expenses | CRUD on the user's records; reads from the database, writes via side effects | `DATABASE_URL` for persistence (else browser storage) | no | `chat/__tests__/tools.route.test.ts`, eval 3, 5, 17 |
| calculate | Built-in calculators and formulas | none | no | tools.route.test |
| manage_reminders | Reminders; delivery by the reminders cron | database, cron (GitHub Actions, every 5 min) | no | reminders tests |
| manage_calendar | Google Calendar read/create | Google connected with calendar scope | no | communicate.route.test |
| manage_contacts | Synced device contacts | contacts synced from the device | no | contacts tests |
| communicate | Email (send needs Confirm), WhatsApp/SMS/call deep links | Gmail send scope for direct email; else a Gmail draft link | email: yes | communicate.route.test, eval 13, 14, 16 |
| pay | Opens the UPI app with the amount; never pays itself | a UPI app on the device | yes | actions tests |
| navigate, open_app, book_reservation | Opens URLs and apps | none | no | agentActions tests |
| web_search, get_news, get_weather, stock_quote, translate, deep_research, smart_summary | Keyless web data and LLM summaries | outbound internet; an LLM provider key | no | lib tests per source |
| search_knowledge | Search uploaded documents | database (pgvector for semantic search) | no | cortex tests |
| generate, create_asset, save_file | Documents, invoices, PDFs, Studio assets as files | an LLM provider key | no | tools.route.test, studio tests |
| remember, learn | Long-term memory | database | no | memory tests |
| control_device | Torch, vibrate, volume, DND, notify, speak on this device; Home Hub devices | browser/OS support; reports what actually happened | no | `lib/__tests__/deviceControl.test.ts` |
| emergency_alert | Opens dialer for 112 and WhatsApp to contacts | phone | user taps | tools.route.test |
| github | Read repos, issues, pulls, files, code search | GitHub connected | no | github tests |
| multi_agent_run, business_agent, weekly_report, automate | Multi-step LLM work over the user's data | an LLM provider key | no | agent tests |
| anchor | Release robot (publishing) | owner account only (`OWNER_EMAILS`) | publish: yes | anchor tests |
| play_music, get_health_data, initiate_protocol | Client-side actions | device support | no | client tests |
| MCP tools | Tools from server-configured MCP servers | `MCP_SERVERS` env | writes: yes | `lib/mcp` tests |

## Not supported (reported honestly, never simulated)

- Uploading apps to the Play Store or App Store.
- Completing a purchase or payment. JARVIS opens the payment app; the user pays.
- Booking flights or hotels end to end (it opens the booking site).
- Any tool name not in the declarations: the result is "I don't have a handler",
  counted as failed and listed under "Not completed" (eval 10).

## Configuration

- At least one LLM key: `GEMINI_API_KEY` (primary) or `GROQ_API_KEY`,
  `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` and others listed in
  `frontend/src/lib/env.ts`. Without any, chat returns an honest outage message.
- `DATABASE_URL`, `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `NEXTAUTH_URL`.
- `OWNER_EMAILS` for owner-only tools (ANCHOR, work context).
- Google OAuth for Gmail/Calendar; GitHub OAuth for the github tool.
