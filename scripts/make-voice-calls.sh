#!/bin/sh
# Writes the voice calls a.wav, b.wav and c.wav into assets/sounds with macOS
# text-to-speech. Usage: scripts/make-voice-calls.sh [voice]
#
# Each call is cut to the spoken letter (leading and trailing silence removed,
# capped at 0.45 s so it stays punchy), limited for loudness, then padded to
# 1 s like the beeps from generate-sounds.js: Android needs a file over 1 s for
# its first play to sound. The file name is the call's label in the generator.
set -e
VOICE="${1:-Daniel}"
OUT="$(dirname "$0")/../assets/sounds"
TMP="$(mktemp -d)"
mkdir -p "$OUT"

for letter in A B C; do
  name="$(echo "$letter" | tr 'A-Z' 'a-z')"
  say -v "$VOICE" -r 260 -o "$TMP/$name.aiff" "$letter."
  ffmpeg -y -v error -i "$TMP/$name.aiff" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,atrim=end=0.45,afade=t=out:st=0.40:d=0.05,highpass=f=120,volume=12dB,alimiter=limit=0.95:level=false,apad=whole_dur=1.0" \
    -ac 1 -ar 44100 -c:a pcm_s16le "$OUT/$name.wav"
  echo "  ✓  $name.wav"
done

rm -rf "$TMP"
