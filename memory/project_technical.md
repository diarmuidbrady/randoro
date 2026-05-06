---
name: Technical Decisions
description: Key technical decisions made and their outcomes
type: project
originSessionId: 6db02655-3401-4670-a275-04d82ebca659
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
- JS: `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'doNotMix' })` in RunningScreen.js. `'doNotMix'` produces empty options matching the native config.
- Per-player: every `useAudioPlayer` call passes `{ keepAudioSessionActive: true }` — defaults are false and break background.
- Why these exact params (and what's been ruled out): see [project_audio_session.md](project_audio_session.md).