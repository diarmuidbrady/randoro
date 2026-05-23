---
name: Technical Decisions
description: Key technical decisions made and their outcomes
type: project
originSessionId: 6db02655-3401-4670-a275-04d82ebca659
---
**Stack:** React Native with Expo (SDK 54), expo-audio 1.1.1, @react-native-picker/picker, react-navigation

**Duration state shape:** Changed from string seconds (e.g. '180') to {minutes, seconds} objects. parseSeconds in time.js converts to total seconds. Conversion happens in handleStart, not in the picker component.

**DurationPicker component:** Replaced DurationBlock. Has two variants — 'main' (work/rest, colored top border) and 'peripheral' (warmup/cooldown, compact row). Uses Modal with scroll wheels on tap. Uses @react-native-picker/picker.

**Interval count calculation:** Fixed to use minGap + avgFrequency combined as full_gap, not avgFrequency alone. Removed minGap >= avgFrequency validation as it's no longer needed.

**TestFlight workflow:** Archive in Xcode → Distribute → App Store Connect → Upload. Build number increments each archive. Version number stays at 1.0.0 until public App Store release.

**Audio session config (post-investigation):**

- Native: plugins/withAudioSession.js injects setCategory(.playback, mode: .default, options: [.mixWithOthers]) + setActive(true) into AppDelegate at launch via BEGIN/END markers.
- JS: setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'duckOthers' }) at module load in RunningScreen.js.
- Per-player: every useAudioPlayer call passes { keepAudioSessionActive: true } — without this, expo-audio deactivates the session after each beep.
- Silence track: 60-min 110 Hz sine at 8 kHz, volume 0.05, played non-looped while workout runs. Required for background audio and Bluetooth A2DP routing. Non-looped because expo-audio's loop=true has a gap iOS treats as audio stopping. Non-zero volume because some BT speakers won't hold the route at volume 0. Non-zero PCM because iOS cuts the stream after a short delay if samples are all zero.
- Full investigation: memory/project_bluetooth_audio_log.md