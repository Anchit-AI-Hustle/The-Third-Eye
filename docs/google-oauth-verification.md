# Google OAuth verification — response to Trust & Safety

Project **jarvis-anchit** (529553308976), app **The Third Eye**, `https://the-third-eye.anchit-tandon.com`.

The October 2026 email raised six points. This file says what changed in code and what the project owner still has to do in the Console. This agent cannot type into Google Cloud Console, record video or reply to email.

| Email point | Fix |
|---|---|
| Scope justification insufficient (gmail.readonly, gmail.send, calendar.readonly, chat.spaces.readonly) | New justifications below. Each one names the user-facing feature, the API call behind it and why a narrower scope fails. |
| Scope discrepancy: code vs Console | Code now requests exactly **three** scopes (`INGESTION_SCOPE_LIST` in `frontend/src/lib/googleToken.ts`, pinned by `oauthScopes.test.ts`). The Console must list the same three, no more. |
| Demo video: one feature per scope, gmail.send impact on the source account | Shot list in §3. |
| Consent screen fully expanded | Shot list step 3. |
| Test credentials + instructions | Reply template in §4. |
| Don't serve unverified scopes to production traffic | §5. |

## 1. What changed in code (least privilege)

| Before | After | Why |
|---|---|---|
| `calendar.readonly` | `calendar.events.owned.readonly` | The only Calendar call is `events.list` on the user's own primary calendar. No other calendars, calendar list, settings or ACL access is needed. |
| `chat.spaces.readonly` | removed | Chat ingestion is gone. It needed a Workspace account, so consumer users couldn't use it. |
| `chat.messages.readonly` (restricted) | removed | Same. This also removes a second restricted scope from review. |
| `gmail.readonly` | kept | Task extraction and search need message bodies and `q` search. |
| `gmail.send` | kept | Narrowest scope that can send. |

The consent screen at *Settings → Connections → Connect Google* now shows `openid email profile` and these three:

```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.events.owned.readonly
```

Users who connected before keep their old `calendar.readonly` grant working (`googleCapabilities` accepts it). They are asked for the narrower one next time they reconnect.

## 2. Console → Google Auth Platform → Data Access

1. **Remove** `calendar.readonly`, `chat.spaces.readonly`, `chat.messages.readonly`, and `calendar.events` / `calendar.events.readonly` if listed.
2. **Add** `.../auth/calendar.events.owned.readonly`.
3. The list must now be exactly `gmail.readonly` (restricted), `gmail.send` and `calendar.events.owned.readonly` (sensitive). Any extra scope is a discrepancy.
4. Paste the two justifications **verbatim**. They are the strings in `frontend/src/lib/oauthJustifications.ts`, each under 1000 characters.

### Sensitive box — `gmail.send`, `calendar.events.owned.readonly`

```
The Third Eye is a personal assistant. Both scopes act only on the signed-in user's own account, after they click Connect Google.

gmail.send (users.messages.send): 1) The user asks the Assistant to email someone; a card shows recipient, subject and body, and nothing is sent until they click Confirm. The mail then appears in their Sent folder. 2) Reminders and a daily task briefing the user switched on are emailed to the user's own address. Never sent on the app's own initiative.

calendar.events.owned.readonly (events.list on the user's own primary calendar): when the user asks "what's on my calendar today/this week", the Assistant lists event titles, times and locations. Not stored, never modified.

Why narrower scopes are insufficient: gmail.send is the narrowest scope that can send (gmail.compose adds drafts). calendar.freebusy has no titles or locations, so it can't answer. calendar.events.owned.readonly is limited to calendars the user owns and replaces calendar.readonly.
```

### Restricted box — `gmail.readonly`

**What features will you use?** → **Email productivity**. Do not pick backup, migration, monitoring, anti-spam or CRM.

```
Used only on the signed-in user's own mailbox, after they click Connect Google.

1. Task Tracker: every 3 hours and when the user opens the app, unread mail from the last 2 days (max 25) is read and action items and deadlines become tasks the user can edit or delete.
2. Assistant: when the user asks ("any email from my bank?"), mail is searched and the matching message summarised.

Data lifecycle: bodies are processed in memory; raw bodies, threads and attachments are not stored. We keep extracted task titles and due dates, processed message IDs (to avoid duplicates) and an AES-256-GCM encrypted refresh token. Never sold, used for ads or to train generalised AI models; content goes to an AI provider only to complete the user's request (Limited Use).

Why gmail.metadata is insufficient: it returns headers only and cannot run search queries (q). Action items and deadlines are in the body, so extraction and search need gmail.readonly. We never modify or delete mail.
```

5. **Demo video URL**: the Unlisted YouTube link from §3.
6. Save.

## 3. Demo video — shot list

Upload to YouTube as **Unlisted**. Record on the production URL, in English, in a fresh incognito window. Keep the whole browser window and the **address bar** in frame. Record one continuous take through the consent step. Target length is 3–5 minutes.

1. **The app.** Show the address bar with `the-third-eye.anchit-tandon.com`, then the app name and logo.
2. **Sign in** with the mobile number and PIN. Say: "Signing in requests nothing from Google."
3. **Settings → Connections → Connect Google.** On Google's screen:
   - pick the test account;
   - if Google shows a scope summary, click the link that **expands every permission** (or "See all"). Scroll so **each of the three permissions is fully visible and legible**;
   - zoom into the **address bar** until the `client_id=529553308976-…` parameter is readable;
   - click **Allow**. Do not cut.
4. Back in Settings, Google shows as connected with the granted permissions.
5. **gmail.readonly.** Open the test account's Gmail in a second tab. Show an unread email with an action item, e.g. "Please send the Q3 report by Friday." Go back to the app's **Task Tracker** and click **Scan now**. The task "Send the Q3 report" appears with its due date. Then ask the Assistant "any email from <sender>?" and show the summary. Say: "the app reads mail; it never changes or deletes it."
6. **gmail.send.** In **Assistant**, type "email <second address you control> saying the report is ready". The confirmation card shows To, Subject and Body. Say "nothing is sent until I press Confirm", then press **Confirm**. Then show the source-account impact:
   - the test account's Gmail **Sent** folder, with the message as the newest item from the test account;
   - the recipient's inbox receiving it;
   - optionally, a reminder email arriving in the test account's own inbox.
7. **calendar.events.owned.readonly.** In Google Calendar, show two events on the test account. In **Assistant**, ask "what's on my calendar this week?". The same titles, times and locations are listed. Say: "read only; the app never creates or edits events."
8. **Revoking.** Open `myaccount.google.com/permissions` and show The Third Eye with its access. Optional.

Do **not** show creating a calendar event. "Add to calendar" opens a `calendar.google.com` link and doesn't use the API.

## 4. Reply to the Trust & Safety email

> Subject: Re: OAuth verification — jarvis-anchit (529553308976)
>
> Hello,
>
> Thank you for the review. We have addressed each point:
>
> 1. **Minimum scopes.** We now request three scopes only: gmail.readonly, gmail.send and calendar.events.owned.readonly. calendar.readonly was replaced by calendar.events.owned.readonly, which only covers events on calendars the user owns. The Google Chat scopes (chat.spaces.readonly, chat.messages.readonly) were removed with the feature that used them. The Data Access page now matches what the application requests exactly.
> 2. **Justifications.** These are updated in Data Access. They describe each feature, the API call behind it and why a narrower scope is insufficient.
> 3. **Demo video.** Link: [UNLISTED YOUTUBE URL]. It shows the fully expanded consent screen with the client ID in the address bar, then each scope in use. For gmail.send it shows the confirmation step and the message in the source account's Sent folder.
> 4. **Test account.**
>    - The app's own sign-in is a mobile number and PIN: **[TEST MOBILE NUMBER] / PIN [XXXX]**. This sign-in requests no Google permissions.
>    - The Google account to connect is **[test-account@gmail.com] / [password]**. 2-Step Verification is off, and the account is listed under Test users.
>
>    Steps:
>    1. Open https://the-third-eye.anchit-tandon.com and sign in with the mobile number and PIN above.
>    2. Go to Settings → Connections → **Connect Google**. This is the consent screen under review. Sign in with the Google test account and click Allow.
>    3. gmail.readonly: open Task Tracker and click "Scan now". Action items from the account's unread mail become tasks. You can also ask the Assistant "any email from …?".
>    4. gmail.send: in Assistant, type "email [address] saying hello". A confirmation card appears. Nothing is sent until you click Confirm, and the message then appears in the account's Sent folder.
>    5. calendar.events.owned.readonly: in Assistant, ask "what's on my calendar this week?".
>
>    The connected scopes are not served to general production traffic until verification is complete; see point 5 below.
> 5. **Unverified scopes.** Until verification completes, only test users can complete Connect Google. Everyone else uses the app without Google access.
>
> Kind regards,
> Anchit Tandon

## 5. Keeping unverified scopes off production traffic

Google enforces this when the app's **Audience → Publishing status** is **Testing**. Only accounts on the Test users list (max 100) can complete Connect Google. Everyone else is refused on Google's screen, and the app keeps working without Gmail and Calendar (`googleCapabilities` reports "not connected"). Sign-in is phone + PIN and isn't affected.

- While review is open: stay in **Testing** (or switch back to it). Add your own account, the test account and any address Trust & Safety gives you.
- After approval: publish to **In production**.

## 6. Pre-flight before recording

- The **live build includes this change**. Check `/api/health` → `commit_short` against `main`. Until Vercel deploys again, the live consent screen still asks for the old five scopes, and recording it would reproduce the discrepancy.
- `GOOGLE_CLIENT_ID` on Vercel is the jarvis-anchit client.
- Branding: name *The Third Eye*, logo, home page, `/privacy_policy`, `/terms_of_service`, authorized domain `anchit-tandon.com`. The privacy policy lists the same three scopes.
- The test account has an unread email with a clear action item and deadline, and two calendar events this week.
- `/api/health` → `providers.gemini` is `true`, so extraction works.

Restricted-scope (`gmail.readonly`) approval also needs a **CASA** security assessment through a Google-approved assessor. Google will send instructions after this review.
