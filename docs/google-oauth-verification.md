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

**Automated recording (Mac):** `scripts/oauth-demo/record-demo.mjs` drives Chrome through this exact shot list on the live site, screen-records it with ffmpeg (address bar included), and adds spoken narration, burned-in captions and a zoom on the consent screen's `client_id`. Steps it can't click itself pause and ask you to click; the recording keeps running. From the repo root on the Mac: `TEST_EMAIL=<test account> RECIPIENT=<second address> npm run demo`. It installs, opens Chrome once for you to sign in to Google (press Enter when done), then records. The finished file is `scripts/oauth-demo/out/the-third-eye-oauth-demo.mp4`.


Upload to YouTube as **Unlisted**. Record on the production URL, in English, in a fresh incognito window. Keep the whole browser window and the **address bar** in frame. Record one continuous take through the consent step. Target length is 3–5 minutes.

1. **The app.** Show the address bar with `the-third-eye.anchit-tandon.com`, then the app name and logo.
2. **Sign in** with Google. On Google's screen, say: "Sign-in asks only for my name and email. Mail is a separate step." Show that the permissions listed are profile only, not Gmail.
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
>    - Sign-in is Google, identity only (name and email). Use **[test-account@gmail.com] / [password]**. 2-Step Verification and phone verification are off. This sign-in does not request Gmail or Calendar.
>
>    Steps:
>    1. Open https://the-third-eye.anchit-tandon.com and choose Continue with Google. The consent screen for sign-in lists profile access only.
>    2. Go to Settings → Connections → **Connect Google**. This is the consent screen under review. Sign in with the Google test account and click Allow.
>    3. gmail.readonly: open Task Tracker and click "Scan now". Action items from the account's unread mail become tasks. You can also ask the Assistant "any email from …?".
>    4. gmail.send: in Assistant, type "email [address] saying hello". A confirmation card appears. Nothing is sent until you click Confirm, and the message then appears in the account's Sent folder.
>    5. calendar.events.owned.readonly: in Assistant, ask "what's on my calendar this week?".
>
> 5. **Unverified scopes.** The app is In Production. Until verification completes, Connect Google is enabled only for the owner and the test account above, so the unverified scopes are not served to general traffic. Other users see that Gmail and Calendar access is under review. If you test with a different Google account, reply with its address and we will enable it.
>
> Kind regards,
> Anchit Tandon

## 5. Keeping unverified scopes off production traffic

Google's instruction: the publishing status **stays In Production**, and the unverified scopes must only be triggered for a limited set of users. Switching to Testing locks out the reviewers, because their accounts aren't on the Test users list.

- **Audience → Publishing status: In production.**
- On Vercel, set `GOOGLE_CONNECT_USERS` to a comma-separated list: your own email plus the review test account. Only those accounts can start Connect Google. Everyone else gets "under review" in Settings, and the Task Tracker's Gmail prompt is hidden.
- After approval, delete `GOOGLE_CONNECT_USERS` so every user can connect.

## 6. Pre-flight before recording

- The **live build includes this change**. Check `/api/health` → `commit_short` against `main`. Until Vercel deploys again, the live consent screen still asks for the old five scopes, and recording it would reproduce the discrepancy.
- `GOOGLE_CLIENT_ID` on Vercel is the jarvis-anchit client.
- Branding: name *The Third Eye*, logo, home page, `/privacy_policy`, `/terms_of_service`, authorized domain `anchit-tandon.com`. The privacy policy lists the same three scopes.
- The test account has an unread email with a clear action item and deadline, and two calendar events this week.
- `/api/health` → `providers.gemini` is `true`, so extraction works.

Restricted-scope (`gmail.readonly`) approval also needs a **CASA** security assessment through a Google-approved assessor. Google will send instructions after this review.
