# OAuth verification video recorder: macOS runbook

This script records the **real** The Third Eye Google OAuth consent flow and Gmail/Calendar features for the `jarvis-anchit` Google review. It uses FFmpeg's macOS display capture; **the usual macOS screen-recording toolbar will not appear**. FFmpeg running is not evidence of a usable video by itself.

## Mac setup

Prerequisites: Chrome, Node, FFmpeg (`brew install ffmpeg`), and macOS **System Settings → Privacy & Security → Screen & System Audio Recording** permission for your terminal/FFmpeg. Restart the terminal after granting it, if needed. Use a dedicated Chrome test profile containing only the test Google account. Avoid personal messages, notifications or unrelated windows on screen.

1. From the repository root, after pulling the latest commit:

   ```sh
   TEST_EMAIL='approved-test-account@gmail.com' RECIPIENT='real-test-inbox-you-control@gmail.com' npm run demo
   ```

   Do not use an `@example.com` recipient. Google reviewers need real source-account evidence of the sent message.

2. **Setup occurs off-camera.** Sign into Google in the spawned Chrome browser. Use exactly the account in `TEST_EMAIL`. Complete the setup prompt.
3. The recorder first captures a short **warm-up video** and opens a local **capture-preview.png** image. This is a necessary preflight: check that it actually shows **the Chrome window and browser address bar**. Type `YES` only if it does. A black frame, desktop, other display, or missing browser means **do not record**; fix screen permissions or select the correct capture display.
4. After `YES`, the terminal prints `RECORDING LIVE` and the full absolute path of `raw.mp4`. This is the actual video capture, not a macOS screenshot overlay.
5. The script verifies the The Third Eye session email matches `TEST_EMAIL`, opens `/settings?tab=account`, clicks **Account & Connections**, checks for the **Google account** card, and checks the server's `GOOGLE_CONNECT_USERS` gate before beginning OAuth. If a required screen is missing, it saves a local `failed-scene-*.png` screenshot and stops rather than pretending the screen appeared.
6. The app requests **the actual** Google consent screen; recording is only assembled after the Google client ID and all three granted scopes are verified. The test inbox must have a recent, unread `Q3 report` email containing an action item and deadline; add two events to the test account's calendar before recording.
7. The script captures a Gmail send confirmation and checks a corresponding message in Gmail Sent, demonstrates a Calendar read, and shows the disconnect control **without revoking the connected account**.

## Recording files

All paths are relative to the script directory, regardless of the shell working directory:

| File | Meaning |
|---|---|
| `scripts/oauth-demo/out/warmup.mp4` | Short permission/screen capture test |
| `scripts/oauth-demo/out/capture-preview.png` | Frame you must inspect before typing YES |
| `scripts/oauth-demo/out/raw.mp4` | Actual screen capture, potentially partial if a required scene fails |
| `scripts/oauth-demo/out/failed-scene-*.png` | Local screenshot of the last page when an expected UI screen was missing |
| `scripts/oauth-demo/out/the-third-eye-oauth-demo.mp4` | Finished narrated video, only after successful completion and assembly |

All capture files are ignored by Git: they may contain personal messages, account information, and consent parameters. Do **not** commit or publicly upload `raw.mp4`, screenshots, browser profiles, passwords or tokens. Review/redact the final video before uploading it unlisted for Google.

## Troubleshooting

**No recording indicator:** Normal for FFmpeg. The terminal prints the output video path. Confirm the capture preview; check the local `raw.mp4` file.

**Preview is black, shows wallpaper or the wrong monitor:** Verify macOS Screen Recording permission; inspect FFmpeg's capture devices:

```sh
ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1
```

Set `SCREEN=<device index>` in front of the command if Chrome is on another monitor. `SCREEN` is an FFmpeg AVFoundation **video device index**, not the macOS display arrangement number. Verify the preview again.

**"Google account connection card" absent:** Make sure the Google sign-in completed for `TEST_EMAIL`. The script now visits `/settings?tab=account` and selects **Account & Connections** explicitly. A previous script version navigated to default Device settings and searched for non-existent text `// Connections`.

**"excluded by GOOGLE_CONNECT_USERS":** The **production** app deliberately prevents the signed-in test email from reaching consent until that Google email is added to the reviewer allowlist. Do not open all unverified scopes to all production users.

**No new Gmail task:** Ensure the disposable test message arrived within the last two days and is unread. Scans may be rate-limited. The script stops if no task is ingested; a silent or zero-result scan is not sufficient evidence.

**Test account already logged into Google:** To skip repeating setup after the initial sign-in, run `TEST_EMAIL='...' RECIPIENT='...' npm run demo:record`. It still performs the screen preview gate each time.

**Unexpected failure:** Do not delete the raw recording. Inspect the last local `failed-scene-*.png` and terminal error. Only share screenshots after redacting any sensitive account data. Do not submit a final video to Google if consent, Gmail Sent or Calendar evidence is missing.

**Approval:** This recorder provides authentic evidence, not a guarantee of Google's verification decision.
