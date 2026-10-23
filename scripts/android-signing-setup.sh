#!/bin/bash
# Makes the Android signing key once and stores it as the four repository
# secrets android-apk.yml signs with. Run on a Mac (or any machine with a JDK
# and the GitHub CLI, signed in with `gh auth login`), from the repo root:
#   scripts/android-signing-setup.sh
# The key and its password stay in ~/.the-third-eye-android/. Back that folder
# up: a lost key means everyone reinstalls the app.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v keytool >/dev/null || { echo "Install a JDK first: brew install openjdk."; exit 1; }
command -v gh >/dev/null || { echo "Install the GitHub CLI first: brew install gh, then gh auth login."; exit 1; }

DIR="$HOME/.the-third-eye-android"
KS="$DIR/the-third-eye.keystore"
ALIAS=the-third-eye
mkdir -p "$DIR" && chmod 700 "$DIR"
if [ ! -f "$KS" ]; then
  openssl rand -hex 24 > "$DIR/password" && chmod 600 "$DIR/password"
  keytool -genkeypair -keystore "$KS" -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$(cat "$DIR/password")" -keypass "$(cat "$DIR/password")" -dname "CN=The Third Eye" >/dev/null
  echo "Made a new signing key in $DIR"
fi

PASS="$(cat "$DIR/password")"
base64 < "$KS" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64
printf %s "$PASS" | gh secret set ANDROID_KEYSTORE_PASSWORD
printf %s "$ALIAS" | gh secret set ANDROID_KEY_ALIAS
printf %s "$PASS" | gh secret set ANDROID_KEY_PASSWORD
echo "✓ The four ANDROID_* secrets are set. The next build from main publishes a signed APK."
