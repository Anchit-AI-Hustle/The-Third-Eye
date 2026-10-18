#!/bin/bash
# Prints why The Third Eye last crashed: the newest crash report from the
# connected iPhone (unlocked, cable) and from this Mac, cut to the lines that
# name the cause. Run on the Mac right after the crash:  scripts/ios-crash-report.sh
set -uo pipefail

summarize() {
  python3 - "$1" <<'PYEOF'
import json, sys
text = open(sys.argv[1], errors="replace").read()
head, _, body = text.partition("\n")
try:
    r = json.loads(body)
except ValueError:
    print(text[:3000]); sys.exit()
print("App:", r.get("procName"), r.get("bundleInfo", {}).get("CFBundleShortVersionString", ""), "| OS:", r.get("osVersion", {}).get("train", ""))
ex = r.get("exception", {})
print("Exception:", ex.get("type"), ex.get("signal"), ex.get("subtype", ""))
term = r.get("termination", {})
if term:
    print("Termination:", term.get("namespace"), term.get("code"), term.get("indicator", ""))
    for d in term.get("details", []) or []:
        print("  ", d)
if r.get("asi"):
    print("Reason:", json.dumps(r["asi"])[:1500])
images = r.get("usedImages", [])
for t in r.get("threads", []):
    if t.get("triggered"):
        print("Crashed thread:")
        for f in t.get("frames", [])[:15]:
            img = images[f["imageIndex"]]["name"] if f.get("imageIndex", -1) < len(images) and "name" in images[f["imageIndex"]] else "?"
            print("  ", img, f.get("symbol", hex(f.get("imageOffset", 0))))
PYEOF
}

found=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if xcrun devicectl list devices --json-output "$tmp/devices.json" >/dev/null 2>&1; then
  DEVICE=$(python3 -c 'import json,sys
for d in json.load(open(sys.argv[1]))["result"]["devices"]:
    if d.get("hardwareProperties",{}).get("platform")=="iOS" and d.get("connectionProperties",{}).get("pairingState")=="paired":
        print(d["identifier"]); break' "$tmp/devices.json")
  if [ -n "$DEVICE" ]; then
    xcrun devicectl device info files --device "$DEVICE" --domain-type systemCrashLogs --json-output "$tmp/logs.json" >/dev/null 2>&1
    NAME=$(python3 -c 'import json,sys
files=[f for f in json.load(open(sys.argv[1]))["result"]["files"] if f.get("name","").startswith("App-") and f["name"].endswith(".ips")]
files.sort(key=lambda f: f.get("metadata",{}).get("lastModDate",""))
print(files[-1]["name"] if files else "")' "$tmp/logs.json" 2>/dev/null)
    if [ -n "$NAME" ]; then
      xcrun devicectl device copy from --device "$DEVICE" --domain-type systemCrashLogs --source "$NAME" --destination "$tmp/iphone.ips" >/dev/null 2>&1
      echo "=== iPhone: $NAME ==="; summarize "$tmp/iphone.ips"; found=1
    else
      echo "No App crash report on the iPhone yet."
    fi
  fi
fi

MAC=$(ls -t "$HOME"/Library/Logs/DiagnosticReports/App-*.ips 2>/dev/null | head -1)
if [ -n "$MAC" ]; then
  echo "=== Mac: $(basename "$MAC") ==="; summarize "$MAC"; found=1
fi

[ "$found" = 1 ] || echo "No crash report found. Open the app once more so it crashes, then run this again."
