---
name: Project Context
description: What randoro is, current state, and active issues
type: project
originSessionId: 6db02655-3401-4670-a275-04d82ebca659
---
Randoro is a random interval timer for shadow boxing. It plays random audio cues (beeps) during work rounds to keep training unpredictable. Used by Diarmuid to coach beginner boxing classes — music plays through a Bluetooth speaker while the app fires beeps over the top.

**Current state (as of April 2026):**
- TestFlight build 1.0.0 (build 2) is live and being tested
- Dev branch has DurationPicker UI changes ahead of main
- Apple Developer account enrolled, TestFlight set up

**Active bug:**
- Audio does not route to Bluetooth A2DP speakers (Anker Soundcore). Works on earpiece and wireless headphones. Root cause: expo-audio does not expose AVAudioSession Bluetooth routing options. Investigating react-native-audio-session or similar native module as fix. This is a hard requirement — app is used with Bluetooth speaker in gym.

**Queued work:**
- Bluetooth speaker audio fix (blocker)
- Rounds input scroll wheel (currently TextInput)
- Visual cleanup on setup screen (borders/shadows feel heavy)
- Landing/home screen before setup
- Info (?) tooltip feature for settings labels