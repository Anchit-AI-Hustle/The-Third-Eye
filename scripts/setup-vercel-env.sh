#!/usr/bin/env bash
# Run this script locally (not in the cloud container) to set all env vars in Vercel.
# Prerequisites: vercel CLI installed and linked (vercel link)
# Usage: bash scripts/setup-vercel-env.sh

set -e

echo "=== JARVIS OS — Vercel Environment Setup ==="
echo ""
echo "This will add the following env vars to your Vercel project (Production + Preview + Development)."
echo ""

ENVS=(
  "ANTHROPIC_API_KEY:Your Anthropic API key (from console.anthropic.com)"
  "OPENAI_API_KEY:Your OpenAI API key (from platform.openai.com) — for Whisper transcription"
  "NEXT_PUBLIC_SUPABASE_URL:Supabase project URL (from supabase.com → Settings → API)"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY:Supabase anon key (from supabase.com → Settings → API)"
  "NEXTAUTH_SECRET:Random secret — run: openssl rand -base64 32"
  "NEXTAUTH_URL:Your production URL, e.g. https://jarvis-anchit.vercel.app"
  "GOOGLE_CLIENT_ID:Google OAuth client ID (from console.cloud.google.com)"
  "GOOGLE_CLIENT_SECRET:Google OAuth client secret"
)

for entry in "${ENVS[@]}"; do
  KEY="${entry%%:*}"
  DESC="${entry#*:}"
  echo "──────────────────────────────────────────────"
  echo "  Key  : $KEY"
  echo "  What : $DESC"
  echo ""
  read -rsp "  Value (hidden): " VALUE
  echo ""
  if [ -z "$VALUE" ]; then
    echo "  Skipped."
    continue
  fi
  echo "$VALUE" | vercel env add "$KEY" production --force 2>/dev/null || true
  echo "$VALUE" | vercel env add "$KEY" preview --force 2>/dev/null || true
  echo "$VALUE" | vercel env add "$KEY" development --force 2>/dev/null || true
  echo "  ✓ $KEY added to all environments"
  echo ""
done

echo "══════════════════════════════════════════════"
echo "All done! Run 'vercel --prod' to redeploy."
echo ""
echo "Or trigger a redeploy from the Vercel dashboard."
