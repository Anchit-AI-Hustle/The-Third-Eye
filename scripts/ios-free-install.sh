#!/bin/bash
# Builds the native iOS app and installs it on an iPhone connected by cable,
# signed with a free Apple ID: no Apple Developer Program needed. A free
# signature lasts 7 days; run this again to renew it (your data stays).
#
# Once: Xcode > Settings > Accounts > add your Apple ID. On the iPhone turn on
# Settings > Privacy & Security > Developer Mode.
#
# Usage, from the repo root on a Mac:  scripts/ios-free-install.sh [TEAM_ID]
set -euo pipefail
cd "$(dirname "$0")/.."

command -v xcodebuild >/dev/null || { echo "Install Xcode from the App Store first."; exit 1; }

TEAM_ID="${1:-${TEAM_ID:-}}"
if [ -z "$TEAM_ID" ]; then
  # The team ID is the OU of the Apple Development certificate Xcode made for your Apple ID.
  TEAM_ID=$(security find-certificate -c "Apple Development" -p 2>/dev/null \
    | openssl x509 -noout -subject 2>/dev/null | sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p' | head -1)
fi
if [ -z "$TEAM_ID" ]; then
  cat <<'EOF'
No signing team found. Once:
  1. Xcode > Settings > Accounts > + > Apple ID, and sign in.
  2. Open ios/App/App.xcodeproj, select the App target > Signing & Capabilities,
     tick "Automatically manage signing", Team: "<your name> (Personal Team)".
Then run this script again (or pass the 10-character team ID shown there).
EOF
  exit 1
fi
# A free team can't use a bundle ID another team has registered, so make one of its own.
BUNDLE_ID="${BUNDLE_ID:-com.thethirdeye.app.$(echo "$TEAM_ID" | tr '[:upper:]' '[:lower:]')}"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
xcrun devicectl list devices --json-output "$tmp/devices.json" >/dev/null
read -r DEVICE UDID < <(python3 - "$tmp/devices.json" <<'EOF'
import json, sys
for d in json.load(open(sys.argv[1]))["result"]["devices"]:
    if d.get("hardwareProperties", {}).get("platform") == "iOS" and d.get("connectionProperties", {}).get("pairingState") == "paired":
        print(d["identifier"], d["hardwareProperties"]["udid"])
        break
EOF
) || true
if [ -z "${DEVICE:-}" ]; then
  echo "No iPhone found. Connect it by cable, unlock it and tap Trust, then run this again."
  exit 1
fi

# Xcode only builds to a phone that has Developer Mode on and that it has
# prepared for development once; until then it offers only "Any iOS Device".
xcrun devicectl device info details --device "$DEVICE" --json-output "$tmp/details.json" >/dev/null 2>&1 || true
DEV_MODE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["result"]["deviceProperties"].get("developerModeStatus",""))' "$tmp/details.json" 2>/dev/null || true)
if [ "$DEV_MODE" = "disabled" ]; then
  cat <<'EOF'
Developer Mode is off on the iPhone. Turn it on once:
  Settings > Privacy & Security > Developer Mode > On, let it restart, unlock it and tap Turn On.
Then run this script again.
EOF
  exit 1
fi
if ! xcodebuild -project ios/App/App.xcodeproj -scheme App -showdestinations 2>/dev/null | grep -q "id:$UDID"; then
  open -a Xcode
  cat <<'EOF'
Xcode sees the iPhone but hasn't prepared it for development yet (it offers only "Any iOS Device"). Once:
  1. Keep the iPhone unlocked and connected.
  2. In Xcode (just opened): Window > Devices and Simulators, select the iPhone and wait until
     "Preparing iPhone for development" / "Copying shared cache" finishes. The first time takes a few minutes.
     If it asks to download an iOS platform or device support, accept it.
  3. If Developer Mode isn't on yet: Settings > Privacy & Security > Developer Mode > On.
Then run this script again.
EOF
  exit 1
fi

echo "▶ Preparing the native project…"
npm ci --silent
npx cap sync ios

echo "▶ Building and signing for your iPhone (team $TEAM_ID, $BUNDLE_ID)…"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination "platform=iOS,id=$UDID" -derivedDataPath ios/App/build \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM_ID" PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  build | grep -E "error:|BUILD (SUCCEEDED|FAILED)"

echo "▶ Installing…"
xcrun devicectl device install app --device "$DEVICE" ios/App/build/Build/Products/Release-iphoneos/App.app

if ! xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1; then
  echo "Installed. First time only: on the iPhone open Settings > General > VPN & Device Management,"
  echo "tap your Apple ID under Developer App and tap Trust. Then open The Third Eye."
else
  echo "✓ The Third Eye is open on your iPhone. Run this again within 7 days to renew it."
fi
