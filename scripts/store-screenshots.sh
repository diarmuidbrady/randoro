#!/bin/zsh
# Captures the App Store screenshots on the iOS simulators, unattended.
# For each device: installs a Release build, sets a clean status bar, takes
# the Home shot from a launch burst, and runs .maestro/store-screenshots.yaml
# for the rest. Needs Maestro (brew install mobile-dev-inc/tap/maestro) and ffmpeg.
# Usage: scripts/store-screenshots.sh [iphone|ipad]   (both by default)
set -e
cd "${0:A:h}/.."
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
APP=com.diarmuidbrady.randoro
typeset -A DEVICES=(iphone "iPhone 17 Pro" ipad "iPad Pro 13-inch (M5)")

udid() {
  xcrun simctl list devices available -j | python3 -c "
import json, sys
for runtime in json.load(sys.stdin)['devices'].values():
    for d in runtime:
        if d['name'] == sys.argv[1]: print(d['udid']); sys.exit()
sys.exit('No simulator named ' + sys.argv[1])" "$1"
}

# Home, mid-sweep: a burst of shots from launch. Frames still showing the iOS
# launch animation or the splash have something other than the Home screen's
# #1C1C1E at the left edge (the Home trace never reaches it). Of the rest, keep
# the one with the most red: the R spike drawn and not yet faded.
home_shot() {
  local id=$1 out=$2 tmp=$(mktemp -d)
  xcrun simctl terminate $id $APP 2>/dev/null || true
  xcrun simctl launch $id $APP >/dev/null
  for i in {10..40}; do xcrun simctl io $id screenshot $tmp/$i.png 2>/dev/null; done
  python3 - $tmp $out <<'EOF'
import glob, subprocess, sys
W = 200
def pixels(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-vf', f'scale={W}:-1',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    return [raw[i:i + 3] for i in range(0, len(raw), 3)]
def is_home(px):
    rows = len(px) // W
    edge = [px[y * W + x] for y in range(rows * 3 // 10, rows * 7 // 10) for x in range(6)]
    return all(abs(r - 28) < 12 and abs(g - 28) < 12 and abs(b - 30) < 12 for r, g, b in edge)
def red(px):
    return sum(1 for r, g, b in px if r > 180 and g < 110 and b < 110)
frames = {f: pixels(f) for f in glob.glob(sys.argv[1] + '/*.png')}
home = [f for f, px in frames.items() if is_home(px)] or list(frames)
best = max(home, key=lambda f: red(frames[f]))
# The App Store rejects screenshots with an alpha channel.
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', best, '-pix_fmt', 'rgb24', sys.argv[2]], check=True)
EOF
  rm -r $tmp
}

(( $# )) || set -- iphone ipad
for key in "$@"; do
  name=$DEVICES[$key] out=$PWD/store/screenshots/$key
  mkdir -p $out
  id=$(udid "$name")
  echo "== $name"
  xcrun simctl bootstatus $id -b >/dev/null
  # Expo's final "open the app" step can time out; carry on if the app installed.
  npx expo run:ios --configuration Release --device "$name" --no-bundler ||
    xcrun simctl get_app_container $id $APP >/dev/null
  xcrun simctl status_bar $id override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
  rm -f $out/*.png(N)
  home_shot $id $out/01-home.png
  run=$(mktemp -d)
  maestro --device $id test --test-output-dir $run .maestro/store-screenshots.yaml
  find $run -path '*/takeScreenshot/*.png' -exec cp {} $out/ \; && rm -r $run
  xcrun simctl shutdown $id
done
sips -g pixelWidth -g pixelHeight store/screenshots/*/*.png | grep -v '^/' | paste - - | sort | uniq -c
