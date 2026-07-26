#!/bin/bash
set -e

echo "╔══════════════════════════════════════╗"
echo "║  The Third Eye — Build All Platforms  ║"
echo "╚══════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

BUILD_DIR="./dist"
mkdir -p $BUILD_DIR
RESULTS=()

# ─── 1. WEBSITE (Next.js) ─────────────────────────
echo -e "${BLUE}▶ [1/4] Building Website (Next.js)...${NC}"
cd frontend && npm run build 2>&1 | tail -3 && cd ..
echo -e "${GREEN}✓ Website build complete${NC}"
RESULTS+=("✓ Website (Next.js)")

# ─── 2. MOBILE WEBSITE (PWA) ────────────────────────
echo ""
echo -e "${BLUE}▶ [2/4] Verifying PWA...${NC}"
if [ -f frontend/public/manifest.json ] && [ -f frontend/public/sw.js ] && [ -f frontend/public/icon-192.png ]; then
  echo -e "${GREEN}✓ PWA ready (manifest + SW + icons)${NC}"
  RESULTS+=("✓ Mobile Website (PWA)")
else
  echo -e "${RED}✗ PWA assets missing${NC}"
  RESULTS+=("✗ PWA (missing assets)")
fi

# ─── 3. iOS APP ─────────────────────────────────────
echo ""
echo -e "${BLUE}▶ [3/4] Building iOS App...${NC}"
if command -v xcodebuild &> /dev/null; then
  bash scripts/build-ios.sh 2>&1 | tail -5
  if [ -d "$BUILD_DIR/JARVIS-OS-iOS.app" ]; then
    RESULTS+=("✓ iOS App (dist/JARVIS-OS-iOS.app)")
  else
    RESULTS+=("✗ iOS App (build failed)")
  fi
else
  echo -e "${YELLOW}⚠ Xcode not available — skipping${NC}"
  RESULTS+=("⚠ iOS (requires Xcode on macOS)")
fi

# ─── 4. ANDROID APK ─────────────────────────────────
echo ""
echo -e "${BLUE}▶ [4/4] Building Android APK...${NC}"
(bash scripts/build-android.sh 2>&1 | tail -10) || true
if [ -f "$BUILD_DIR/JARVIS-OS-Android.apk" ]; then
  RESULTS+=("✓ Android APK (dist/JARVIS-OS-Android.apk)")
else
  echo -e "${YELLOW}⚠ Android requires Java 17 + Android SDK${NC}"
  echo "  Install: brew install openjdk@17 && open -a 'Android Studio'"
  RESULTS+=("⚠ Android (needs Java 17 + Android SDK)")
fi

# ─── SUMMARY ────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════╗"
echo "║          BUILD SUMMARY               ║"
echo "╚══════════════════════════════════════╝"
echo ""
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
ls -lh $BUILD_DIR/ 2>/dev/null
echo ""
echo -e "${GREEN}Done!${NC}"
