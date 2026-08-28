#!/usr/bin/env bash
# Interactive Vercel environment setup.
#
# Run this LOCALLY (not in a cloud container) — it needs a logged-in Vercel CLI.
#   npm i -g vercel && vercel login && vercel link
#   bash scripts/setup-vercel-env.sh
#
# Every value is optional: press Enter to skip a key and leave it as it is.
# Each key prints where to generate it and what breaks without it.
#
# Deliberately NOT a web form. A hosted page that rewrites production env vars
# would need a Vercel API token sitting in the app, and anyone who reached it
# could inject secrets into production. The CLI already holds your credentials
# locally, which is the right place for them.

set -uo pipefail

BOLD=$'\033[1m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; DIM=$'\033[2m'; NC=$'\033[0m'

TARGETS=(production preview development)

# key|what it is|where to get it|what is dark without it
ENVS=(
"GEMINI_API_KEY|Primary model — the only provider wired for tool calling|https://aistudio.google.com/apikey|Every tool. Chat degrades to text-only and answers 'live actions are temporarily unavailable'"
"NEXTAUTH_SECRET|Session signing secret|run: openssl rand -base64 32|Sign-in fails outright"
"NEXTAUTH_URL|Canonical origin, no trailing slash|e.g. https://the-third-eye.anchit-tandon.com|OAuth callback mismatch on sign-in"
"NEXT_PUBLIC_APP_URL|Absolute app URL|same value as NEXTAUTH_URL|Canonical/sitemap/OG tags and the Google connect redirect"
"GOOGLE_CLIENT_ID|Google OAuth client|https://console.cloud.google.com/apis/credentials|Google sign-in, Gmail, Calendar, Chat"
"GOOGLE_CLIENT_SECRET|Google OAuth secret|https://console.cloud.google.com/apis/credentials|Same as above"
"NEXT_PUBLIC_SUPABASE_URL|Supabase project URL|https://supabase.com/dashboard/project/_/settings/api|Cloud sync, reminders, Cortex memory"
"NEXT_PUBLIC_SUPABASE_ANON_KEY|Supabase anon key|https://supabase.com/dashboard/project/_/settings/api|Same as above"
"SUPABASE_SERVICE_ROLE_KEY|Supabase service role, server only, bypasses RLS|https://supabase.com/dashboard/project/_/settings/api|Reminders, ingest and every cron job"
"TOKEN_ENCRYPTION_KEY|Encrypts stored Google refresh tokens|run: openssl rand -base64 32|Google tokens cannot be stored, so nothing runs while you are away"
"CRON_SECRET|Guards /api/cron/* against public calls|run: openssl rand -base64 32|Cron endpoints are callable by anyone in production"
"SERPER_API_KEY|Web search, news, nearby places|https://serper.dev/api-key|web_search, get_news, navigate(nearby), deep_research"
"OPENWEATHER_API_KEY|Weather lookups|https://home.openweathermap.org/api_keys|get_weather"
"ANTHROPIC_API_KEY|Fallback text provider|https://console.anthropic.com/settings/keys|One less fallback when Gemini is rate-limited"
"OPENAI_API_KEY|Whisper transcription plus fallback text|https://platform.openai.com/api-keys|Voice transcription quality, one fallback"
"GROQ_API_KEY|Fast fallback text provider|https://console.groq.com/keys|One less fallback when Gemini 429s"
"CEREBRAS_API_KEY|Fast fallback text provider|https://cloud.cerebras.ai|One less fallback when Gemini 429s"
"MCP_INTERNAL_SECRET|Guards the in-repo Google MCP server|run: openssl rand -base64 32|The Google connector stays disabled — it fails closed"
"MCP_SERVERS|Connector servers as JSON — see frontend/.env.local.example|(hand-written JSON)|All MCP connectors"
"VAPID_PRIVATE_KEY|Web push signing|run: npx web-push generate-vapid-keys|Push notifications for reminders"
"NEXT_PUBLIC_VAPID_PUBLIC_KEY|Web push public key|same command as above|Same as above"
"VAPID_SUBJECT|Contact URI for push, e.g. mailto:you@example.com|(your email)|Same as above"
"NEXT_PUBLIC_TEST_UNLOCK_CODE|Testing-mode unlock code on the Plans page|(any string you choose)|The unlock box silently rejects every code"
"STRIPE_SECRET_KEY|Stripe payments|https://dashboard.stripe.com/apikeys|Checkout and subscriptions"
"STRIPE_WEBHOOK_SECRET|Stripe webhook signature|https://dashboard.stripe.com/webhooks|Subscription state never updates after payment"
)

echo
echo "${BOLD}The Third Eye — Vercel environment setup${NC}"
echo "${DIM}Enter to skip any key. Values are hidden as you type.${NC}"
echo

# Preflight. The previous version piped every failure to /dev/null and printed a
# checkmark regardless, so an unlinked project or a logged-out CLI looked exactly
# like a successful run. Fail loudly instead.
if ! command -v vercel >/dev/null 2>&1; then
  echo "${RED}vercel CLI not found.${NC}  Install it with:  npm i -g vercel"
  exit 1
fi
if ! vercel whoami >/dev/null 2>&1; then
  echo "${RED}Not logged in to Vercel.${NC}  Run:  vercel login"
  exit 1
fi
if [ ! -f .vercel/project.json ]; then
  echo "${RED}This directory is not linked to a Vercel project.${NC}  Run:  vercel link"
  exit 1
fi
echo "${GREEN}OK${NC} Vercel CLI ready as $(vercel whoami 2>/dev/null)"
echo

set_one() {  # key value -> prints per-target result, returns 1 if any target failed
  local key="$1" value="$2" failed=0 out
  for target in "${TARGETS[@]}"; do
    # --force overwrites an existing value; without it the CLI errors when the
    # key already exists in that environment.
    if out=$(printf '%s' "$value" | vercel env add "$key" "$target" --force 2>&1); then
      printf '    %sOK%s   %s\n' "$GREEN" "$NC" "$target"
    else
      failed=1
      printf '    %sFAIL%s %s — %s\n' "$RED" "$NC" "$target" "$(printf '%s' "$out" | tail -1)"
    fi
  done
  return $failed
}

SET=0; SKIPPED=0; FAILED=0

for entry in "${ENVS[@]}"; do
  IFS='|' read -r KEY WHAT WHERE IMPACT <<<"$entry"
  echo "──────────────────────────────────────────────────────────────"
  echo "  ${BOLD}${KEY}${NC}"
  echo "  ${DIM}${WHAT}${NC}"
  echo "  get it: ${WHERE}"
  echo "  ${DIM}without it: ${IMPACT}${NC}"
  echo
  read -rsp "  value (Enter to skip): " VALUE
  echo
  if [ -z "${VALUE:-}" ]; then
    echo "  ${YELLOW}skipped${NC}"
    SKIPPED=$((SKIPPED + 1))
    echo
    continue
  fi
  if set_one "$KEY" "$VALUE"; then
    SET=$((SET + 1))
  else
    FAILED=$((FAILED + 1))
  fi
  echo
done

echo "══════════════════════════════════════════════════════════════"
echo "  ${GREEN}${SET} set${NC} · ${YELLOW}${SKIPPED} skipped${NC} · ${RED}${FAILED} failed${NC}"
echo
# BACKEND_URL is intentionally absent above: unset means "no FastAPI backend",
# and sign-in then skips the session exchange instead of calling a hostname that
# resolves only inside docker-compose.
echo "  ${DIM}BACKEND_URL is deliberately not offered — leave it unset unless you"
echo "  deploy the FastAPI backend. See .env.example.${NC}"
echo
if [ "$FAILED" -gt 0 ]; then
  echo "  ${RED}Some keys failed — nothing was redeployed.${NC} Fix them, then re-run."
  exit 1
fi
if [ "$SET" -gt 0 ]; then
  echo "  Env vars only take effect on a new build. Redeploy with:"
  echo "    ${BOLD}vercel --prod${NC}"
fi
echo
