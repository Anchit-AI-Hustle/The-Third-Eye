# Google OAuth verification — how to clear the "App functionality" rejection

The rejection is about **the demo video** and **giving the Trust & Safety team a way to test the OAuth consent flow** — not the app code. This doc has everything to submit.

## The app + scopes under review
- **App:** The Third Eye — `https://the-third-eye.anchit-tandon.com`
- **OAuth consent screen must show this exact app name + logo** (the video is rejected as "not the same app" when the registered name/logo/domain don't match what's on screen). In Google Cloud Console → **APIs & Services → OAuth consent screen**, confirm: App name = *The Third Eye*, the logo, **Application home page** = the URL above, **Privacy policy** = `…/privacy_policy`, **Terms** = `…/terms_of_service`, **Authorized domain** = `anchit-tandon.com`.
- **Requested scopes and why (state these verbatim in the justification):**
  | Scope | Why the app needs it |
  |---|---|
  | `gmail.readonly` | Scan recent emails to auto-extract action items into the user's Task Tracker. |
  | `gmail.send` | Send an email **only** when the user explicitly confirms a drafted message in the assistant. |
  | `calendar.readonly` | Show the user their upcoming events when they ask about their schedule. |
  | `calendar.events` | Create a calendar event when the user asks the assistant to schedule one. |
  | `chat.spaces.readonly`, `chat.messages.readonly` | Scan Google Chat messages to auto-extract action items into the Task Tracker. |

## Where the consent flow lives (critical — the reviewer must test THIS)
Sign-in (NextAuth) requests **only** `openid email profile` — no sensitive scopes. The sensitive/restricted scopes are requested by the **separate, opt-in "Connect Google" flow** at **`/api/connect/google`**, reachable from:
- **Settings → Connections** ("Connect Gmail / Calendar / Chat"), and
- the **Task Tracker** "Connect Gmail & Chat" banner.

The video and the reviewer must go through **that Connect flow** to see the consent screen with the sensitive scopes — not just the plain sign-in.

## 1) Reply to the Trust & Safety email (copy-paste, fill the brackets)

> Subject: Re: OAuth verification — The Third Eye — test instructions
>
> Hello,
>
> Thank you for the review. Here is how to reach and test the OAuth consent flow for **The Third Eye** (`https://the-third-eye.anchit-tandon.com`).
>
> **Test account (already allow-listed as a Test User):**
> - Email: `[your-test-gmail@gmail.com]`
> - Password: `[password]`
> - This account has 2-Step Verification **disabled** and a few sample emails/Chat messages so the functionality is visible.
>
> **Steps to reach the OAuth consent screen:**
> 1. Open `https://the-third-eye.anchit-tandon.com` and click **Sign in with Google**; sign in with the test account (this step uses only `openid email profile`).
> 2. In the left sidebar open **Settings → Connections** (or open **Task Tracker** and use the **"Connect Gmail & Chat"** banner).
> 3. Click **Connect Gmail / Calendar / Chat**. This starts the OAuth flow at `/api/connect/google` and shows the Google **consent screen** listing the Gmail, Calendar, and Chat scopes. Click **Allow**.
> 4. You are redirected back to the app; the Connections page now shows the account as connected.
>
> **How each scope is exercised (for the functionality demonstration):**
> - Gmail read → open **Task Tracker**; recent emails are scanned and action items appear as tasks.
> - Gmail send → ask the assistant "email [x] about [y]"; it drafts the email and asks for confirmation, and only sends on **Confirm**.
> - Calendar → ask the assistant "what's on my calendar"; and "schedule [event] tomorrow at 3pm" creates an event.
> - Google Chat read → messages in the connected account's spaces are scanned into the Task Tracker.
>
> Please let me know if you need anything else.
>
> Thanks,
> Anchit Tandon

## 2) Demo video — shot list (screen recording, 2–4 min, no cuts through the consent step)

Record on the **production URL** so the registered app name/logo appear. Cover, in one flow:

1. **Show the app is the submitted app** — the browser address bar on `the-third-eye.anchit-tandon.com`, the app name/logo on screen.
2. **Sign in** with the test account (Google sign-in).
3. **Trigger the OAuth consent flow** — Settings → Connections → **Connect Gmail/Calendar/Chat**. Show:
   - the Google **account chooser**,
   - the **consent screen** with the app name and the **full list of requested scopes** clearly visible,
   - clicking **Allow**, and the **redirect back** to the app showing "connected".
4. **Demonstrate functionality for each scope** (this is the part that was "insufficient"):
   - Task Tracker showing **tasks auto-created from Gmail** (and Chat).
   - Ask the assistant to **draft + send an email** → show the confirm step → sent.
   - Ask **"what's on my calendar"** → events shown; **"schedule …"** → event created.
5. Keep it a **single continuous capture** through the consent step (reviewers reject edited/spliced consent screens).

## 3) Console checklist before resubmitting
- OAuth consent screen: app name/logo/home/privacy/terms/authorized-domain all match the live app (see top).
- **Test users:** add the test account under **OAuth consent screen → Test users** (and the reviewer's address if they provide one).
- All six scopes listed above are added under **Data access** with the justifications.
- Re-upload the new video, reply to the T&S email with the instructions above, then **Resubmit for verification**.
