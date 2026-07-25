# Agentic actions — voice/chat can act, with approval

The assistant doesn't just answer — it can *do things* on the user's behalf,
gated by a confirm-then-act step for anything sensitive. Two execution paths:

## 1. Server-executed actions
Run server-side via `/api/act` after the user confirms the exact payload.
Today: `send_email` (Gmail). These need a connected account/permission.

## 2. Deep-link intents (open the target app, pre-filled)
Resolved by `lib/intents.ts` into a standard app deep link / web intent; the
app opens **pre-filled** and the user completes it in the target app. This is
how "do anything on any app" works safely in a web app — we never execute the
sensitive step ourselves.

| Tool | Opens | Approval |
|---|---|---|
| `pay` | UPI app (GPay/PhonePe/Paytm) via `upi://pay?pa&am&pn&tn` — pre-filled payee + amount | **Confirm card** → the payment app asks for PIN. We never touch money. |
| `send_whatsapp` | WhatsApp `wa.me/<n>?text=` pre-filled | Confirm card → user taps send |
| `make_call` | Dialer `tel:` | Confirm card |
| `send_sms` | Messages `sms:` pre-filled | Confirm card |
| `open_app` | Any app/site (universal link, native app on mobile) | Direct |
| `navigate_maps` | Google Maps directions | Direct |
| `add_calendar_event` | Google Calendar event template, pre-filled | Direct |

### Why deep links (not silent execution)
A web app can't (and shouldn't) silently move money or send messages from inside
another app. Handing a **pre-filled intent** to the real app — where the user
approves with their PIN / send button — is both the only reliable cross-app
mechanism and the correct security model. For payments specifically, funds are
only ever moved by the user's own payment app after their explicit approval.

### How approval + opening work together
Sensitive intents (`pay`/`send_whatsapp`/`make_call`/`send_sms`, plus
`send_email`) are in `SENSITIVE_ACTIONS` (`lib/actions.ts`). The chat stream
emits a `confirm` event with a human summary and, for deep-link intents, the
resolved `url` + `clientAction: true`. The `ActionCard` shows the details; the
**confirming tap** opens the deep link (a real user gesture, so iOS allows it)
— `upi:`/`tel:`/`sms:` navigate to the OS handler, `https:` opens a new tab.
Low-risk intents (`open_app`/`navigate_maps`/`add_calendar_event`) skip the card
and open directly via an `open_url` side effect.

### Guardrails
- The trigger must be an explicit user request in the conversation — never a
  directive found inside ingested content (see the security section of the chat
  system prompt).
- `pay` requires an explicit payee (VPA) + amount; the model is instructed to
  ask rather than guess either.
