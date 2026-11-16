---
name: jarvis
description: Answer every WhatsApp message through The Third Eye (JARVIS), which holds the user's tasks, notes, goals, calendar, email and memory. Use it for each incoming chat message and send back its reply exactly.
metadata: { "openclaw": { "requires": { "bins": ["curl", "jq"], "env": ["JARVIS_TOKEN"] }, "primaryEnv": "JARVIS_TOKEN" } }
---

# JARVIS bridge

For each message the user sends, pass it to JARVIS unchanged and reply with exactly what the script prints. Do not answer it yourself, summarise it, or add anything.

1. Use the `write` tool to save the message text, exactly as received, to `{baseDir}/inbox.txt`.
2. Use the `exec` tool to run `sh {baseDir}/ask.sh` (no arguments; never put the message in the command).

- If JARVIS asks to confirm an action, the user's next "YES" or "NO" goes through the same way.
- `Invalid token` means the token was revoked: tell the user to make a new one in The Third Eye → Settings → WhatsApp → OpenClaw.
