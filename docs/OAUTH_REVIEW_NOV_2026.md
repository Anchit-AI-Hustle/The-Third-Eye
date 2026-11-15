# Jarvis-Anchit OAuth verification — November 2026 review package

**Google Cloud project:** `jarvis-anchit` (project number `529553308976`)  
**Production app:** https://the-third-eye.anchit-tandon.com  
**Status on 15 November 2026:** Privacy policy, branding, data access and minimum-scopes reviews passed; app functionality rejected. **Google's 29 October email specifically reported a Settings loop after clicking Connect Google, even though sign-in worked.**

## 1. Fix reviewer access before filming

1. In the **production** Vercel deployment, inspect `GOOGLE_CONNECT_USERS`. This is an allowlist of email addresses; an account not listed is redirected to `/settings?tab=account&connect=google_pending` **without ever reaching Google**.
2. For verification, ensure that the **exact, active Google test account supplied privately to Google Trust & Safety** is present in the allowlist. Do not publish a test password in GitHub. If Google needs to use their own account, request the reviewer's address by replying to the existing Trust & Safety thread, then add that address. Do **not** use `*` permanently, because this would expose the unverified sensitive/restricted scopes to general production users.
3. Verify that the app sign-in account email matches the allowlisted account. A different Gmail address selected during OAuth is not a substitute for passing the app's allowlist.
4. Google Cloud → Google Auth Platform → **Clients** → Web client for this app:
   - Authorized JavaScript origin: `https://the-third-eye.anchit-tandon.com`
   - Authorized redirect URIs: `https://the-third-eye.anchit-tandon.com/api/auth/callback/google` and `https://the-third-eye.anchit-tandon.com/api/connect/google/callback`
   - Production `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must belong to **the same project and client**. Do not expose secrets.
5. Google Auth Platform → Audience: external, **In production**. Data Access: the scopes must match the actual live authorization request.
6. Re-test in a private Chrome window: **Sign in → Settings → Account & Connections → Google account → Connect Google**. The URL should change to `accounts.google.com` showing **The Third Eye** and the actual consent form. It must not silently bounce back to Settings. If it does, inspect the account allowlist, `?connect=` banner, OAuth redirect URI, Vercel runtime logs and callback token storage errors.
7. After allowing access, visit **Settings → Account & Connections** and verify **Connected** plus Gmail read, Gmail send and Calendar badges. The backend `/api/connect/google/status` should report `connected: true` and all three feature scopes for this logged-in test account.

## 2. What must appear in the video (real screen capture, no mock UI)

**Use an actual authorized test Gmail account with only disposable messages and calendar events; avoid real personal mail on camera.** Keep Google's language set to English.

| Sequence | Footage | Verification evidence |
|---|---|---|
| 1 | Chrome address bar with production URL; app name and logo | Same app as submission |
| 2 | **Continue with Google** sign-in | Initial identity-only sign-in |
| 3 | Settings → **Account & Connections** → **Connect Google** | The user actively initiates the additional Google grant |
| 4 | Entire **real** consent screen on `accounts.google.com`, app name, **full `client_id` in browser address bar**, **Show all services** expanded, each grant legible, **Allow** | Exact requested scope consent; continuous screen recording |
| 5 | Return to Settings showing Connected and granted permissions | Authorization actually saved |
| 6 | Show disposable unread Gmail message containing an action item; Task Tracker **Scan now**, resulting task; Assistant query summarizing the email | `gmail.readonly`: Gmail content used for a visible user feature, with source-account corroboration |
| 7 | Assistant requests an email; display recipient/subject/body; press **Confirm**; show result in that **same source Google account's Sent folder**, and recipient inbox if possible | `gmail.send`: precise effect of a write scope and user confirmation |
| 8 | Show two events in **test account's** Google Calendar, then Assistant `What's on my calendar this week?` displaying matching titles/times | `calendar.events.owned.readonly`: read-only user-facing integration |
| 9 | Show Settings connection controls and explain revocation; optional to disconnect **after** all scenes | User control and data handling |

**Requested feature scopes (must match Cloud Console):**
```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.events.owned.readonly
```
The separate identity scopes `openid email profile` may also appear. No Google Chat, `calendar.readonly` or Calendar write scope should be requested.

**Show why narrower scopes do not work:** `gmail.metadata` omits message bodies and cannot support message-body task extraction or the required Gmail search query; `gmail.send` is the narrowest permission for sending; free/busy access lacks event titles and locations.

## 3. Capture the real footage with the existing Mac recorder

The repo already contains `scripts/oauth-demo/record-demo.mjs`; this branch adds fail-closed evidence checks so a successful-looking MP4 is not exported after skipped consent or missing grants.

Prerequisites: Mac, Chrome, Node, FFmpeg (`brew install ffmpeg`), Terminal Screen Recording permission, test account available for Google sign-in, and a separate recipient address you own. Have an unread Gmail message with **Q3 report** in the subject, a deadline in the body and two calendar events on the account's primary calendar. The message must be recent enough for Scan now to ingest.

From the repository root:
```bash
TEST_EMAIL='the-approved-review-test-account@example.com' RECIPIENT='another-address-you-control@example.com' npm run demo
```

The `setup` step prompts for Google sign-in **before recording**; the recording step captures Chrome and runs the app, Google consent and feature demo. Complete any manual prompts during the continuous capture. Its finished file, **only after successful assembly**, is `scripts/oauth-demo/out/the-third-eye-oauth-demo.mp4`. Open and review the complete MP4 before sharing. No passwords or OAuth tokens should appear in recording, repo, logs or email.

**Stop, do not submit**, if any item is missing: actual Google consent UI; exact Google OAuth client ID; all three visible permissions; connected backend status after granting; a real task from Gmail; a confirmed sent message in the source Gmail Sent folder; corresponding Calendar events; legible browser address bar; English language. The script now halts on missing consent URL/client, missing scopes or missing Sent-folder message, but a **human must also review all other screenshots and app responses**.

## 4. Give Google access and a working video link

- Upload the completed real recording to YouTube **Unlisted** (or a Google-accessible Drive link). Test the link in a signed-out window.
- Reply **in the existing Trust & Safety email thread**. Include: unlisted link, project number, exact client ID/project match, confirmed production app URL, approved test account **privately** and how they can sign in, and precise click path **Settings → Account & Connections → Connect Google**.
- Confirm the production Vercel `GOOGLE_CONNECT_USERS` includes their reviewer/test account **before** saying access is fixed. Do not claim success based only on a GitHub commit.
- If the reviewing team wishes to use its own Google account instead of the supplied test account, ask for the account address and add it to the short-lived review allowlist; do not bypass the allowlist for all users.

## 5. Final reviewer reply template (send only after checks are true)

Subject: Re: [Action Needed] OAuth Verification Request Acknowledgement

Hello Google OAuth Verification Team,

We corrected the Google consent access path and recorded a new, end-to-end demonstration for project **jarvis-anchit (529553308976)**.

**New video:** [insert tested unlisted video URL]

**How to reproduce:** Open https://the-third-eye.anchit-tandon.com, sign in using the privately provided Google test account, select **Settings → Account & Connections → Connect Google**, expand **Show all services**, then grant access. This is the separate OAuth consent flow under review. The account is enabled in our production review allowlist. After authorization, use **Tasks → Scan now**, ask the Assistant to summarize a test email, request and confirm a test email (verify in Google **Sent**), and ask `What's on my calendar this week?` (compare against the account's Google Calendar).

The recording shows the full consent screen and browser client ID; the same three feature scopes configured in Data Access: `gmail.readonly`, `gmail.send`, `calendar.events.owned.readonly`; and each corresponding feature with source-account evidence. No broader or unused Google Chat scopes are requested.

Please let us know if your reviewer will use a different Google account so we can authorize that specific account for this review.

Kind regards,
The Third Eye team

---

**Caution:** Approval is ultimately Google's decision; an untested recording, inaccurate reviewer-access claim or fake/mock consent UI must never be submitted.
