#!/bin/bash
set -e

echo "╔══════════════════════════════════════╗"
echo "║  The Third Eye — Android APK Builder  ║"
echo "╚══════════════════════════════════════╝"

# Find Java
if [ -z "$JAVA_HOME" ]; then
  if command -v /usr/libexec/java_home &> /dev/null; then
    export JAVA_HOME=$(/usr/libexec/java_home 2>/dev/null)
  elif [ -d "/Library/Java/JavaVirtualMachines" ]; then
    export JAVA_HOME=$(ls -d /Library/Java/JavaVirtualMachines/*/Contents/Home 2>/dev/null | head -1)
  fi
fi

if [ -z "$JAVA_HOME" ] || [ ! -f "$JAVA_HOME/bin/java" ]; then
  echo "ERROR: Java not found. Install with:"
  echo "  brew install openjdk@17"
  echo "  OR download from https://adoptium.net/"
  exit 1
fi

echo "Using Java: $JAVA_HOME"
"$JAVA_HOME/bin/java" -version 2>&1

# Find Android SDK
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
if [ ! -d "$ANDROID_HOME" ]; then
  echo "ERROR: Android SDK not found at $ANDROID_HOME"
  echo "Install Android Studio or set ANDROID_HOME"
  exit 1
fi

export PATH=$PATH:$ANDROID_HOME/platform-tools

echo ""
echo "▶ Syncing web assets to Android..."
npx cap sync android 2>&1 | tail -5

echo ""
echo "▶ Building debug APK..."
cd android && ./gradlew assembleDebug 2>&1 | tail -10

APK_PATH=$(find . -name "app-debug.apk" | head -1)
if [ -n "$APK_PATH" ]; then
  mkdir -p ../dist
  cp "$APK_PATH" ../dist/JARVIS-OS-Android.apk
  echo ""
  echo "✓ APK built: dist/JARVIS-OS-Android.apk"
  ls -lh ../dist/JARVIS-OS-Android.apk
else
  echo "ERROR: APK not found after build"
  exit 1
fi
