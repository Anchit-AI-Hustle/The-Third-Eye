# Google OAuth verification — Data Access boxes

The rejection **"Request minimum scopes: the provided justification does not sufficiently explain why the requested OAuth scopes are necessary"** is a Console paste error, not a missing feature.

Google Auth Platform → **Data Access** has **three justification boxes**, grouped by sensitivity. The previous paste put a `gmail.readonly` blurb in the **sensitive** box. That box does not contain `gmail.readonly`. It contains `gmail.send`, `calendar.readonly` and `chat.spaces.readonly`, none of which the text mentioned.

Canonical copy lives in `frontend/src/lib/oauthJustifications.ts` and is length-checked (≤1000 chars) by `oauthScopes.test.ts`. Paste those strings **verbatim**. Do not start mid-sentence.

This agent cannot type into Google Cloud Console. The steps below are for the project owner in the jarvis-anchit project.

## Console: three boxes, not five one-liners

| Box | Scopes in that table | Paste |
|---|---|---|
| Sensitive | `gmail.send`, `calendar.readonly`, `chat.spaces.readonly` | `SENSITIVE_SCOPES_JUSTIFICATION` |
| Restricted — Gmail | `gmail.readonly` | `GMAIL_READONLY_JUSTIFICATION` |
| Restricted — Chat | `chat.messages.readonly` | `CHAT_MESSAGES_JUSTIFICATION` |

**Five scopes. Not six.** `calendar.events` is not requested. Remove it from Data Access if it is still listed.

Do **not** drop Chat. Task Tracker lists spaces (`spaces.list` → `chat.spaces.readonly`) and reads opted-in messages (`spaces.messages.list` → `chat.messages.readonly`). The second scope cannot list spaces; both stay.

### 1. Sensitive box

Paste:

```
The Third Eye (the-third-eye.anchit-tandon.com) is a personal productivity assistant. These scopes are used only after the user opts in at Settings → Connections.

gmail.send: (1) send an assistant-drafted email after the user reviews recipient, subject and body and clicks Confirm; (2) deliver a reminder or daily digest the user scheduled. Never sent on a model's initiative.

calendar.readonly: list upcoming events on the user's primary calendar when they ask about their schedule. Fetched for that request; not stored.

chat.spaces.readonly: list Chat spaces so the user can choose which ones feed Task Tracker. spaces.list requires this scope; no messages are read with it.

Why more limited scopes are insufficient: gmail.compose cannot send. calendar.freebusy has no titles or locations the briefing needs. chat.messages.readonly cannot call spaces.list, so omitting chat.spaces.readonly leaves the space picker empty.
```

### 2. Restricted Gmail — `gmail.readonly`

**What features will you use?** select **Email productivity**. Do not select backup, migration, monitoring, anti-spam or CRM.

Paste:

```
gmail.readonly is used on the signed-in user's own mailbox after they connect Google:

1. Task Tracker ingest — scan unread mail from the last 2 days and extract action items, deadlines and follow-ups into tasks the user can edit or delete.
2. Assistant answers — search or summarise mail the user asked about.

Data lifecycle: bodies are fetched over TLS and processed in memory for that request or ingest pass. We do not store raw email bodies, full threads or attachments. We persist extracted task titles/due dates, Gmail message IDs already processed (dedupe), and an AES-256-GCM encrypted refresh token. Data is never sold, used for ads, or used to train generalised AI models. Content is sent to an AI provider only to complete the user's request (Limited Use).

Why gmail.metadata / gmail.labels are insufficient: they return headers, labels and subjects. Action items and deadlines live in the body. Extraction and summarisation cannot run on metadata.
```

### 3. Restricted Chat — `chat.messages.readonly`

**What features will you use?** **Deselect "Chat app".** This product is not a bot installed into Google Chat. It reads Chat with **user OAuth**, the same pattern as Gmail. If Chat app is the only option, leave the dropdown empty — Google's docs tell Trust & Safety to classify it in that case.

Paste:

```
This is not a Google Chat bot and is not installed into Chat spaces. It is a web assistant that reads Chat on the signed-in user's behalf with user OAuth (Chat API), the same pattern as Gmail.

chat.messages.readonly is used only on spaces the user switched on in Task Tracker, to extract action items, meeting requests and follow-ups from message text.

Data lifecycle: message text is processed in memory. Raw transcripts are not stored. We persist extracted tasks, a per-space watermark (last processed timestamp), and the user's space opt-ins. Never sold, used for ads, or used to train generalised AI models.

Why more limited scopes are insufficient: chat.spaces.readonly lists spaces but cannot call spaces.messages.list. Commitments live in message text, so chat.messages.readonly is required. We do not request chat.messages (read/write) because we never post, edit or delete Chat messages.
```

### 4. Demo video (required for restricted scopes)

YouTube, **Unlisted**. Blank URL = automatic reject. Shot list is in §2 below.

### 5. Save and resubmit

Data Access → Save. Verification Center → Submit for verification.

## Alternative: stay in Testing (personal use)

If the app is only for you / a known group (<100): Audience → **Testing**, add `anchit.tandon@gmail.com` under Test users, do not publish. Restricted-scope review, CASA and the demo video are then not required. The warning icon in Data Access can be ignored.

## The app + the scopes actually under review

- **App:** The Third Eye — `https://the-third-eye.anchit-tandon.com`
- **Consent screen must match the live app.** Branding: App name = *The Third Eye*, logo, **Application home page** = the URL above, **Privacy policy** = `…/privacy_policy`, **Terms** = `…/terms_of_service`, **Authorized domain** = `anchit-tandon.com`.

| Scope | Tier | Demonstrated by |
|---|---|---|
| `gmail.send` | Sensitive | Assistant drafts mail → confirmation card → **Confirm** → Sent folder. Also: a scheduled reminder arriving by email. |
| `calendar.readonly` | Sensitive | Ask "what's on my calendar this week". |
| `chat.spaces.readonly` | Sensitive | Task Tracker → Live Capture & Sources → Chat space picker lists spaces. |
| `gmail.readonly` | Restricted | Task Tracker ingest: tasks appear from email, source visible. |
| `chat.messages.readonly` | Restricted | Same ingest, after a space is switched on: tasks from Chat. |

> **`calendar.events` is NOT requested — do not list or demo it.** `manage_calendar(action:'add')` builds a `calendar.google.com` deep link; there is no Calendar API write. An unused scope is what a reviewer flags. Claiming a capability the app does not have is a false statement to Trust & Safety.

> ### ⚠️ Sign-in is not Google. Re-read this before recording.
>
> Signing in is a **mobile number and a 4-digit PIN**. There is no Google provider on the login screen.
>
> **Every Gmail, Calendar and Chat scope comes from one consent screen:** *Settings → Connections → Connect Google* (`INGESTION_SCOPES`). A video that only shows signing in never shows the scopes under review.

## 1) Reply to the Trust & Safety email

> Subject: Re: OAuth verification — The Third Eye — test instructions
>
> Hello,
>
> Thank you for the review. Here is how to reach and test the OAuth consent flow for **The Third Eye** (`https://the-third-eye.anchit-tandon.com`).
>
> **Test account (already added under Test users):**
> - Email: `[test-account@gmail.com]`
> - Password: `[password]`
> - 2-Step Verification is **disabled** on this account, and it holds sample emails and Google Chat messages so the functionality is visible.
>
> **Reaching the consent screen:**
> 1. Open `https://the-third-eye.anchit-tandon.com` and sign in with the test account's **mobile number and PIN**. This requests nothing from Google.
> 2. You land on the dashboard. Gmail, Calendar and Chat are **not** connected yet, and the app says so.
> 3. Go to **Settings → Connections → Connect Google**. This is the **only** consent screen under review. It lists the Gmail, Calendar and Chat scopes. Click **Allow**.
> 4. Settings now shows Google as connected, with the granted permissions listed.
>
> Step 3 is the consent flow this submission is about. Steps 1-2 grant nothing that needs review.
>
> **Exercising each scope:**
> - `gmail.readonly` → open **Task Tracker**. Recent email is scanned and action items appear as tasks, each showing its source.
> - `chat.spaces.readonly` / `chat.messages.readonly` → in Task Tracker, open the Chat space picker (lists spaces), switch a space on, ingest, and show a task sourced from Chat.
> - `gmail.send` → open **Assistant** and type: *"email [recipient] saying the report is ready"*. The assistant drafts it and shows a confirmation card. Nothing is sent until **Confirm** is clicked.
> - `calendar.readonly` → in **Assistant**, ask *"what's on my calendar this week"*. Upcoming events are listed.
>
> Please let me know if you need anything else.
>
> Thanks,
> Anchit Tandon

## 2) Demo video — shot list

Clears the functionality findings. Record on the **production URL**, 2–4 minutes, **one continuous capture through the consent step**.

**Where it goes: YouTube, visibility Unlisted.** Do **not** commit the recording to this repository.

**Record signed out, in a fresh profile or incognito window.** Narrate in English. Whole browser window in frame, address bar included.

1. **Prove it is the submitted app** — address bar showing `the-third-eye.anchit-tandon.com`, app name and logo.
2. **Sign in with the mobile number and PIN** (no Google consent here).
3. **Settings → Connections → Connect Google** → **the consent screen**. Three things must be legible:
   - the **app name**,
   - the **full scope list** — scroll it if clipped,
   - **the address bar, including `client_id=`**.
   Click **Allow**. Do not cut.
4. **Land on Settings**, Google connected, permissions listed.
5. **Gmail + Chat read** — Task Tracker. Show a task from email and one from Chat. Show the Chat space picker (`chat.spaces.readonly`).
6. **Gmail send** — Assistant, ask it to email someone, confirmation card, **Confirm**, then the test account's **Sent** folder.
7. **Calendar read** — *"what's on my calendar this week"*.

Do **not** demonstrate creating a calendar event.

## 3) Pre-flight before you record

- Test account is under **Test users**.
- `https://the-third-eye.anchit-tandon.com/api/health` → `providers.gemini` is `true`.
- `GOOGLE_CLIENT_ID` is set.
- Ingest cooldown is 60s (`/api/ingest/run`).
- Sample emails and Chat messages with clear action items exist on the test account.
- `commit_short` from `/api/health` matches the live build.

## 4) Console checklist, then resubmit

- Branding matches the live app.
- Test users: the test account, plus any address Trust & Safety gives you.
- Data Access: the five scopes above, **three** justifications, Gmail feature = Email productivity, Chat feature **not** Chat app, Unlisted demo URL filled.
- Reply to the Trust & Safety email, then **Resubmit for verification**.

Restricted-scope review also requires a **CASA** assessment through a Google-approved assessor. Until it clears, only test users can complete *Connect Google*; `docs/GOOGLE_OAUTH.md` is the connect-flow runbook.
