#!/bin/bash
# Installs the listener on this Mac: starts at login, runs in the background,
# listens for "Hey JARVIS" and, given the token from Settings, logs the day.
# Wake-only: run without arguments. Life Log is separate: --enable-lifelog <token>.
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
LIFELOG=0
if [ "${1:-}" = "--enable-lifelog" ]; then
  [ -n "${2:-}" ] || { echo "A Life Log token is required for this explicit mode."; exit 1; }
  LIFELOG=1
  (umask 077 && printf %s "$2" > "$DIR/token")
elif [ -n "${1:-}" ]; then
  echo "Use no arguments for wake-only, or --enable-lifelog with a token for recording."
  exit 1
fi
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
  <key>EnvironmentVariables</key><dict><key>THIRD_EYE_URL</key><string>$SITE</string><key>THIRD_EYE_LIFELOG</key><string>$LIFELOG</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/wake.log</string>
  <key>StandardErrorPath</key><string>$DIR/wake.log</string>
</dict></plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
if [ "$LIFELOG" = 1 ]; then echo "Life Log recording enabled (stop it in Settings -> Activation)."; else echo "Wake-only mode. No ambient audio is uploaded or filed to Life Log."; fi
echo "Done. Say \"Hey JARVIS\" any time. If macOS asks whether Python may use the microphone, click Allow."
