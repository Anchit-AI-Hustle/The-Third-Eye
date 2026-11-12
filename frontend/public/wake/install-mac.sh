#!/bin/bash
# Installs the "Hey JARVIS" helper on this Mac: starts at login, runs in the background.
# Remove it with: launchctl unload ~/Library/LaunchAgents/com.thethirdeye.wake.plist && rm -rf ~/.third-eye-wake ~/Library/LaunchAgents/com.thethirdeye.wake.plist
set -euo pipefail
SITE="${THIRD_EYE_URL:-https://the-third-eye.anchit-tandon.com}"
DIR="$HOME/.third-eye-wake"
PLIST="$HOME/Library/LaunchAgents/com.thethirdeye.wake.plist"
command -v python3 >/dev/null || { echo "Python 3 is needed. Install it from https://www.python.org/downloads/ and run this again."; exit 1; }
mkdir -p "$DIR" "$HOME/Library/LaunchAgents"
echo "Installing into $DIR ..."
python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q --upgrade pip vosk sounddevice
curl -fsSL "$SITE/wake/wake.py" -o "$DIR/wake.py"
if [ ! -d "$DIR/model" ]; then
  echo "Downloading the offline voice model (36 MB, once) ..."
  curl -fsSL https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip -o "$DIR/model.zip"
  (cd "$DIR" && unzip -q model.zip && rm model.zip && mv vosk-model-small-en-in-0.4 model)
fi
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.thethirdeye.wake</string>
  <key>ProgramArguments</key><array><string>$DIR/venv/bin/python</string><string>$DIR/wake.py</string></array>
  <key>EnvironmentVariables</key><dict><key>THIRD_EYE_URL</key><string>$SITE</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/wake.log</string>
  <key>StandardErrorPath</key><string>$DIR/wake.log</string>
</dict></plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Done. Say \"Hey JARVIS\" any time. If macOS asks whether Python may use the microphone, click Allow."
