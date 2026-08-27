# Google OAuth verification — clearing the "App functionality" rejection

The rejection (last reviewed **Aug 20, 2026**) is about **the demo video** and **giving the Trust & Safety team a way to test the OAuth consent flow**. Four findings, none of them code:

1. The demo video does not show the same app that was submitted.
2. The demo video does not show the OAuth consent flow.
3. The demo video does not sufficiently demonstrate the app's functionality.
4. Trust & Safety cannot reach the consent process without more information — **reply to their email**.

> ### ⚠️ The consent flow moved. Re-read this before recording.
>
> A previous version of this doc said sign-in requests only `openid email profile`, and that the sensitive scopes come from a separate **Settings → Connections → Connect Google** step. **That is no longer true.** Sign-in now requests every scope in one consent screen (`SIGNIN_SCOPES` in `frontend/src/lib/googleToken.ts`).
>
> **The consent screen now appears immediately when you click "Continue with Google".** A video that goes looking for it under Settings shows the wrong flow and gets rejected again for the same reason. The Connections page still exists, but only as a repair path for someone who declined a scope.

## The app + the scopes actually under review

- **App:** The Third Eye — `https://the-third-eye.anchit-tandon.com`
- **Consent screen must match the live app.** In Google Cloud Console → **Google Auth Platform → Branding**, confirm App name = *The Third Eye*, the logo, **Application home page** = the URL above, **Privacy policy** = `…/privacy_policy`, **Terms** = `…/terms_of_service`, **Authorized domain** = `anchit-tandon.com`. Finding #1 is what a mismatch here looks like.

**Five scopes are requested. Not six.** Verified against `INGESTION_SCOPE_LIST`:

| Scope | Justification (state verbatim) | Demonstrated by |
|---|---|---|
| `gmail.readonly` | Scan recent email to extract action items into the user's Task Tracker. | Open **Task Tracker** — ingest runs in the foreground and tasks appear. |
| `gmail.send` | Send an email only when the user explicitly confirms a drafted message. | Ask the assistant to email someone → confirmation card → **Confirm**. |
| `calendar.readonly` | Show the user their upcoming events when they ask about their schedule. | Ask "what's on my calendar this week". |
| `chat.spaces.readonly` | List the user's Chat spaces so their messages can be scanned. | Task Tracker ingest (same run as Gmail). |
| `chat.messages.readonly` | Scan Chat messages to extract action items into the Task Tracker. | Task Tracker ingest (same run as Gmail). |

> **`calendar.events` is NOT requested — do not list or demo it.** An earlier version of this doc listed it and told the reviewer that "schedule an event" creates a calendar entry. **It does not.** `manage_calendar(action:'add')` builds a `calendar.google.com` deep link that the user clicks; there is no Calendar API write anywhere in the codebase. The scope was deliberately dropped (see the comment in `googleToken.ts`) because an unused restricted scope is exactly what a reviewer flags. Claiming a capability the app does not have is worse than a rejection — it is a false statement to Trust & Safety.

## 1) Reply to the Trust & Safety email

This clears finding #4, and it blocks everything else — the reviewer cannot proceed at all without it. Fill the brackets.

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
> **Reaching the consent screen — it is the first thing you see:**
> 1. Open `https://the-third-eye.anchit-tandon.com` and click **Continue with Google**.
> 2. Choose the test account. The **Google consent screen appears immediately**, listing all requested Gmail, Calendar and Chat scopes together. Click **Allow**.
> 3. You land on the dashboard, already connected. There is no second connection step.
>
> **Exercising each scope:**
> - `gmail.readonly`, `chat.spaces.readonly`, `chat.messages.readonly` → open **Task Tracker** in the sidebar. Recent email and Chat messages are scanned on open, and action items appear as tasks, each showing its source.
> - `gmail.send` → open **Assistant** and type: *"email [recipient] saying the report is ready"*. The assistant drafts it and shows a confirmation card with the exact recipient, subject and body. Nothing is sent until **Confirm** is clicked.
> - `calendar.readonly` → in **Assistant**, ask *"what's on my calendar this week"*. Upcoming events are listed.
>
> Please let me know if you need anything else.
>
> Thanks,
> Anchit Tandon

## 2) Demo video — shot list

Clears findings #1, #2 and #3. Record on the **production URL**, 2–4 minutes, **one continuous capture through the consent step** (a spliced consent screen is rejected).

**Where it goes: YouTube, visibility Unlisted.** Google takes a link, not a file — you paste the URL into the verification form. Do **not** commit the recording to this repository: GitHub rejects files over 100 MB, there is no Git LFS configured here, and a binary that size would live in the history permanently (the whole repo is currently ~8 MB).

**Record signed out, in a fresh profile or incognito window.** If you are already signed in you never see the consent screen — which is finding #2.

**The whole browser window must be in frame, address bar included** — see step 2. Record the full screen or a maximized window; do not crop to the page content.

**Narrate it, in English.** Voice-over or on-screen callouts pointing at each requirement as it appears. Google explicitly says this speeds the review, and the reviewer is matching your footage against a checklist.

1. **Prove it is the submitted app** — address bar showing `the-third-eye.anchit-tandon.com`, app name and logo on screen. Hold for a beat.
2. **Click "Continue with Google"** → account chooser → **the consent screen**. Three things must be legible here, and this is the shot the review turns on:
   - the **app name** on the consent screen,
   - the **full scope list** — scroll it if it is clipped,
   - **the browser address bar, including the `client_id=…` parameter**. Google requires the OAuth client ID to be visible in the URL of the consent screen, which is how they tie the recording to the client under review. A cropped or narrow window hides it and fails the check.

   Then click **Allow**. Do not cut anywhere in this sequence.
3. **Land on the dashboard**, signed in.
4. **Gmail + Chat read** — open **Task Tracker**. Show tasks extracted from email and Chat, pointing out the source on a task.
5. **Gmail send** — open **Assistant**, ask it to email someone. Show the confirmation card, click **Confirm**, then show the message in the test account's Gmail **Sent** folder. That last shot is what makes the send undeniable.
6. **Calendar read** — ask *"what's on my calendar this week"* and show the events returned.

Do **not** demonstrate creating a calendar event. See the note above.

## 3) Pre-flight before you record

Each of these has a live failure mode that would ruin the take or cause another rejection.

- **The test account is under *Test users*.** Sign-in requests restricted scopes, so a non-test account gets `AccessDenied` **at login** — you would never reach the consent screen.
- **`GEMINI_API_KEY` is set and has quota.** Check `https://the-third-eye.anchit-tandon.com/api/health` → `providers.gemini` must be `true`. If Gemini fails, the assistant drops into degraded mode and answers *"Live actions are temporarily unavailable"* — on camera, in the middle of the `gmail.send` demo.
- **`GOOGLE_CLIENT_ID` is set on the backend**, or the backend session exchange fails.
- **Ingest cooldown is 60s** (`/api/ingest/run`). Opening Task Tracker repeatedly while rehearsing can return `skipped: cooldown` and show no new tasks. Wait a minute between takes.
- **Sample data exists** in the test account — a few emails and Chat messages that clearly contain action items, so step 4 has something to show.
- **`commit_short`** from `/api/health` matches the build you expect to be live.

## 4) Console checklist, then resubmit

- Branding: name, logo, home page, privacy policy, terms, authorized domain all match the live app.
- **Test users:** the test account, plus any address Trust & Safety gives you.
- **Data access:** exactly the five scopes above, each with its justification. Remove `calendar.events` if it is still listed.
- Upload the new video, **reply to the Trust & Safety email**, then **Resubmit for verification**.

Restricted-scope review also requires a **CASA security assessment** through a Google-approved assessor — budget several weeks and a recurring fee. Until it clears, only test users can sign in; `docs/GOOGLE_OAUTH.md` carries the one-line rollback to identity-only scopes if you need open sign-in sooner.
