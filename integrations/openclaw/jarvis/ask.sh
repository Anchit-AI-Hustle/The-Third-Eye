#!/bin/sh
# Sends inbox.txt to JARVIS and prints the reply. The message only ever travels
# as file data, and the token through curl's stdin config, never argv.
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
body=$(mktemp)
trap 'rm -f "$body" "$dir/inbox.txt"' EXIT
jq -Rs '{text: .}' < "$dir/inbox.txt" > "$body"
printf 'header = "Authorization: Bearer %s"\n' "$JARVIS_TOKEN" |
  curl -sS --max-time 300 -K - -X POST -H "Content-Type: application/json" --data-binary "@$body" \
    "${JARVIS_URL:-https://the-third-eye.anchit-tandon.com}/api/bridge/message" |
  jq -r '.reply // .error'
