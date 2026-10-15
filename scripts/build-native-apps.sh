#!/usr/bin/env bash
set -euo pipefail

# Build Native Apps for Android, iOS, and Mac
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== 1. Syncing Capacitor Plugins & Web Assets ==="
npm install
npx cap sync

echo "=== 2. Building Android APK ==="
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
(
  cd android
  JAVA_HOME="$JAVA_HOME" ANDROID_HOME="$ANDROID_HOME" ./gradlew assembleDebug
)

echo "=== 3. Building iOS App ==="
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination "generic/platform=iOS Simulator" -configuration Debug CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination "name=My Mac" -configuration Debug CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build

echo "=== 4. Packaging Deliverables into dist-apps/ ==="
mkdir -p dist-apps/android dist-apps/ios dist-apps/mac
cp android/app/build/outputs/apk/debug/app-debug.apk dist-apps/android/JARVIS_OS-debug.apk
cp -R ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphoneos/App.app dist-apps/ios/App.app
cp -R ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphoneos/App.app dist-apps/mac/JARVIS_OS-Mac.app

mkdir -p dist-apps/ios/Payload
cp -R dist-apps/ios/App.app dist-apps/ios/Payload/
(cd dist-apps/ios && zip -r -y -q JARVIS_OS.ipa Payload && rm -rf Payload)
(cd dist-apps/mac && zip -r -y -q JARVIS_OS-Mac.zip JARVIS_OS-Mac.app)

echo "=== Build Complete! ==="
ls -lh dist-apps/android dist-apps/ios dist-apps/mac
