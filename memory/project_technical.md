---
name: Technical Decisions
description: Key technical decisions made and their outcomes
type: project
originSessionId: 6db02655-3401-4670-a275-04d82ebca659
modified: 2026-08-16T17:10:09.031Z
---
**Stack:** React Native with Expo (SDK 54), expo-audio 1.1.1, @react-native-picker/picker, react-navigation

**expo-audio over expo-av:**
expo-av is fully deprecated as of SDK 55. expo-audio is the current replacement. Do not recommend expo-av.

**Duration state shape:** Changed from string seconds (e.g. '180') to {minutes, seconds} objects. parseSeconds in time.js converts to total seconds. Conversion happens in handleStart, not in the picker component.

**DurationPicker component:** Replaced DurationBlock. Has two variants — 'main' (work/rest, colored top border) and 'peripheral' (warmup/cooldown, compact row). Uses Modal with scroll wheels on tap. Uses @react-native-picker/picker.

**Sandbox build fix:** ENABLE_USER_SCRIPT_SANDBOXING set to NO in project.pbxproj — required to fix sandbox file-write error during iOS builds.

**Interval count calculation:** Fixed to use minGap + avgFrequency combined as full_gap, not avgFrequency alone. Removed minGap >= avgFrequency validation as it's no longer needed.

**TestFlight workflow:** Archive in Xcode → Distribute → App Store Connect → Upload. Build number increments each archive. Version number stays at 1.0.0 until public App Store release.

**Audio session config (current, post-investigation):**
- Native: `plugins/withAudioSession.js` config plugin injects `AVAudioSession.setCategory(.playback, mode: .default, options: [])` + `setActive(true)` into AppDelegate at launch (idempotent via BEGIN/END markers). Survives `expo prebuild`.
- JS: `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'mixWithOthers' })` in RunningScreen.js. `'mixWithOthers'` lets Randoro beeps mix over other apps (e.g. music) instead of silencing them, and prevents iOS pausing our audio when a notification arrives. (Updated 16 Aug 2026 — was previously 'doNotMix'.)
- Per-player: every `useAudioPlayer` call passes `{ keepAudioSessionActive: true }` — defaults are false and break background.
- Why these exact params (and what's been ruled out): see [[project_audio_session]].

**Beep generation (16 Aug 2026):** beeps are a harmonic-rich tone (odd harmonics over the fundamental) for perceived loudness, generated in `scripts/generate-sounds.js`. Normalisation is by true measured peak (scale by `PEAK / actualPeak`), not the harmonic-sum estimate which under-shot and left files ~5 dB too quiet. A browser tuner artifact mirrors the same synthesis math for auditioning values.

**Ghost beep fix (16 Aug 2026):** intermittent flash-with-no-sound was an un-awaited `seekTo(0)` before `play()`. Fixed by awaiting the rewind only when needed. See [[project_ghost_beep_fix]].
