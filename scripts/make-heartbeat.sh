#!/bin/sh
# Cuts one heartbeat from the source clip into assets/heartbeat.wav for the
# home-screen animation. Usage: scripts/make-heartbeat.sh path/to/source.mp3
#
# Source: lenspulse-intense-cinematic-heartbeat-sound-effect-584627.mp3
# The beat at 1.91–2.70 s has its main thump 50 ms in. 0.6 s of leading silence
# wakes an idle Bluetooth output before the thump (and keeps the file over 1 s,
# which Android needs for a first play to sound), so the thump sits at 650 ms.
# HomeScreen's HEARTBEAT_THUMP_MS must match.
set -e
ffmpeg -y -v error -i "$1" \
  -af "atrim=start=1.91:end=2.70,asetpts=PTS-STARTPTS,afade=t=in:d=0.005,afade=t=out:st=0.69:d=0.10,volume=3.7dB,adelay=delays=600:all=1,apad=whole_dur=1.4" \
  -ac 1 -ar 44100 -c:a pcm_s16le "$(dirname "$0")/../assets/heartbeat.wav"
