# Google OAuth reviewer video — real-screen recorder

The Third Eye / Google Cloud project `jarvis-anchit` (`529553308976`).

This utility records the **actual** Chrome app + Google consent flow using FFmpeg display capture; it is not a video generator and must never substitute screenshots, recreated OAuth UI or claimed actions that were not performed. Google is the final authority on approval. The macOS recorder does not display the normal screenshot/recording toolbar.

## Before recording

- Mac with Chrome, Node and FFmpeg (`brew install ffmpeg`), with **Screen & System Audio Recording** permission for Terminal/FFmpeg in System Settings → Privacy & Security. Use one monitor where Chrome is visible. Do not let personal notifications appear in the capture.
- An **approved Google test account** signed into the dedicated Chrome profile `~/.third-eye-demo-chrome`. The app session email must match `TEST_EMAIL`. The production `GOOGLE_CONNECT_USERS` setting must allow this account, and the deployed app must have the same OAuth client and redirect URI as Google Cloud.
- **One non-sensitive Google Calendar event** on the test account's **primary** calendar during the current week, with a recognizable title such as `OAuth Verification Demo Meeting`. Set `DEMO_EVENT_TITLE` to that exact title. The script will verify the event is visible in both the Google Calendar week view and the Assistant response. No Calendar write permission is requested.
- No test email setup is required. The recorder now uses **the actual app** to send a unique action-item message to the same test Gmail account. It checks the message in Gmail Sent and Inbox, scans the resulting task, then demonstrates a second sent email. `RECIPIENT` defaults to `TEST_EMAIL` when omitted; a real existing second mailbox is preferred if available.

## One-time setup

From the repository root:
```sh
git pull --ff-only
TEST_EMAIL='your-approved-test-account@gmail.com' npm run demo:setup
```

Sign into the dedicated Chrome profile as the **same** account. Do not paste passwords into a command or terminal recording.

## Record

```sh
TEST_EMAIL='your-approved-test-account@gmail.com' \
DEMO_EVENT_TITLE='OAuth Verification Demo Meeting' \
RECIPIENT='a-real-email-address-you-control@gmail.com' \
npm run demo:record
```

If you only control one Gmail account, `RECIPIENT` can be omitted; the recorder will send test messages to `TEST_EMAIL`. Never use `@example.com` as the recipient.

The script captures a warmup, opens `out/capture-preview.png`, and requests `YES` only when it **actually displays Chrome and its address bar**. Then it logs `RECORDING LIVE`. If the screenshot is dark, blank or shows another monitor, **do not approve the preview**. Fix screen permission and/or set `SCREEN` to the correct AVFoundation video device index.

## Required scenes (enforced, not inferred from a timer)

1. Actual app identity, or real Google sign-in if the test user isn't already logged in.
2. The user opens **Settings → Account & Connections → Connect Google**.
3. The real `accounts.google.com` authorization request contains the Google Cloud project client ID, then the genuine consent page shows **all three grants expanded and readable**: `gmail.readonly`, `gmail.send`, `calendar.events.owned.readonly`.
4. After Allow, app status confirms **Connected** with all three grants.
5. The Assistant sends a **unique** email to the source account only after the confirmation card; the same email appears in Gmail **Sent** and **Inbox**.
6. Task Tracker **Scan now** produces a fresh task from the Gmail action-item message. The Assistant searches/summarizes the same test email.
7. The Assistant sends another uniquely titled test email to `RECIPIENT`, again after confirmation; the new message appears in the source Gmail **Sent** folder.
8. An actual existing Calendar event is visible on Google Calendar and named in the Assistant's answer to **What's on my calendar this week?**.
9. Google disconnect/revocation controls are shown **without** revoking the test account before the reviewer can access it.

The recorder rejects reused Gmail subject evidence, a mismatched OAuth client ID, missing permissions, absent Calendar results, failure to ingest the named task, and missing videos. If the Google UI has changed, it saves an isolated `failed-scene-*.png` screenshot instead of proceeding as though the permission was granted.

## Outputs and quality control

Files are in `scripts/oauth-demo/out/` regardless of the shell working directory:

| Output | Meaning |
|---|---|
| `warmup.mp4` / `capture-preview.png` | Confirm FFmpeg actually captured the correct Chrome display |
| `raw.mp4` | Actual screen recording, possibly partial if any scene failed |
| `evidence-*.png` | Private snapshots of the actual consent, Gmail and Calendar feature screens |
| `timeline.json` / `evidence-manifest.json` | Recorded timestamps, granted scopes and unique subject evidence |
| `the-third-eye-oauth-demo.mp4` | Only created after required scene evidence is captured and assembled |
| `video-review-contact-sheet.jpg` | FFmpeg-generated frame overview for manual review |
| `video-qc.json` | Results of media and scene-evidence structure validation |

An existing final MP4 is archived as `previous-demo-<run timestamp>.mp4` at the start of each new run to prevent a stale file being mistaken for the new result.

Re-run structural validation independently:
```sh
node scripts/oauth-demo/validate-demo.mjs
```

**Passing structural checks does not certify the actual footage.** Inspect the entire output with sound in a media player. Pause on the Google consent screen and ensure every permission is legible; the browser address bar and project identity must be clear; each screen must actually demonstrate the function described. Verify that no private mail, password, token, unrelated notification or other sensitive information is visible. Only then upload to an accessible **Unlisted** video link for the Google review team.

## Troubleshooting

**Wrong/black capture or no recording indicator:** FFmpeg records without the macOS toolbar. See `capture-preview.png`. To list displays:
```sh
ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1
```
Supply `SCREEN=<video device number>` in front of the record command and inspect the new preview.

**Connect Google returns to Settings:** The test account is excluded by `GOOGLE_CONNECT_USERS`, the Google OAuth redirects are incorrect, or the callback cannot save the grant. Check `?connect=...`, app logs and the runtime `/api/connect/google/status` response for the logged-in test account. Do not allow unverified restricted scopes to all production users.

**No fresh Gmail task:** The assistant must really send its self-addressed task email and Gmail must receive it. Ensure Gmail ingest isn't in cooldown and the app's AI extractor is configured. Look at `failed-scene-*.png` and app logs rather than claiming success after an unrelated scan.

**Calendar event missing:** The name in `DEMO_EVENT_TITLE` must match a visible event in this week's primary calendar. Use an existing test event or create one through Google Calendar (not through The Third Eye).

**Previously signed-in account:** The recorder detects and shows the authenticated test account rather than clicking an absent login button.

**Script crash:** Partial `raw.mp4` may exist and is worth inspecting; no new finished MP4 is published on failure.

**Critical privacy:** Never commit or publish screen recordings, test-account cookies, browser profiles, OAuth authorization codes or personal Gmail content. All capture paths are gitignored. Approval is Google's decision.
