---
name: jarvis
description: Answer every WhatsApp message through The Third Eye (JARVIS), which holds the user's tasks, notes, goals, calendar, email and memory. Use it for each incoming chat message and send back its reply exactly.
metadata: { "openclaw": { "requires": { "bins": ["curl", "jq"], "env": ["JARVIS_TOKEN"] }, "primaryEnv": "JARVIS_TOKEN" } }
---

# JARVIS bridge

For each message the user sends, pass it to JARVIS unchanged and reply with exactly what comes back. Do not answer it yourself, summarise it, or add anything.

Run this with the message text between the two `JARVIS_MSG_END` lines, as-is:

```bash
jq -Rs '{text: .}' <<'JARVIS_MSG_END' | curl -sS --max-time 300 -X POST "${JARVIS_URL:-https://the-third-eye.anchit-tandon.com}/api/bridge/message" -H "Authorization: Bearer $JARVIS_TOKEN" -H "Content-Type: application/json" --data @- | jq -r '.reply // .error'
<the user's message>
JARVIS_MSG_END
```

- If JARVIS asks to confirm an action, the user's next "YES" or "NO" goes through the same way.
- `Invalid token` means the token was revoked: tell the user to make a new one in The Third Eye → Settings → WhatsApp → OpenClaw.
