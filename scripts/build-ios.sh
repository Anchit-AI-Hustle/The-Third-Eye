#!/bin/bash
set -e

echo "╔══════════════════════════════════════╗"
echo "║  The Third Eye — iOS App Builder     ║"
echo "╚══════════════════════════════════════╝"

if ! command -v xcodebuild &> /dev/null; then
  echo "ERROR: Xcode not found. Install from App Store."
  exit 1
fi

echo "▶ Syncing web assets to iOS..."
npx cap sync ios 2>&1 | tail -5

echo ""
echo "▶ Building iOS app (Release)..."
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -sdk iphoneos -derivedDataPath ./build \
  CODE_SIGN_IDENTITY='' CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO \
  ARCHS='arm64' 2>&1 | grep -E '(BUILD|error:)' | tail -10

APP_PATH="./build/Build/Products/Release-iphoneos/App.app"
if [ -d "$APP_PATH" ]; then
  mkdir -p ../../dist
  rm -rf ../../dist/JARVIS-OS-iOS.app
  cp -r "$APP_PATH" ../../dist/JARVIS-OS-iOS.app
  echo ""
  echo "✓ iOS app built: dist/JARVIS-OS-iOS.app"
  du -sh ../../dist/JARVIS-OS-iOS.app
else
  echo "ERROR: .app not found after build"
  exit 1
fi
