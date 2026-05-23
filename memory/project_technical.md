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

**RoundsPicker component:** Replaced the TextInput for rounds with a scroll wheel using the same Modal pattern as DurationPicker. State stays as a string ('3' default); Number(value) conversion happens at the Picker selectedValue prop, String(v) converts back in onValueChange. Range is 1–50. No separate component file — defined inline in SetupScreen.js alongside DurationPicker.

**Intensity and Punches labels:** "Combo" axis renamed to "Punches" with options 1-2, 3-4, 5-6+ to reflect how long a boxer needs to work after each cue. COMBO_MAP keys updated to match. DEFAULT_CONFIG.combo updated to '1-2'.

**Info tooltips:** A single shared Modal controlled by tooltipKey state (null | 'intensity' | 'combo'). Tapping ? next to Intensity or Punches sets the key; tapping the overlay clears it. Tooltips only appear in the presets view — they're absent when Custom is active. Styling is off-white box with border. The title/header treatment needs improvement — current "💡 Info" reads generically and styling feels mismatched with the rest of the app. To revisit.

**Info tooltip design reference:** macOS notification style — dark rounded card, icon on the left (amber lightbulb on dark background in its own small box), bold title to the right of the icon, body text below. Compact, high contrast, icon and title on the same row. Worth referencing for a future tooltip redesign.

**TestFlight workflow:** Archive in Xcode → Distribute → App Store Connect → Upload. Build number increments each archive. Version number stays at 1.0.0 until public App Store release.

**Audio session config (post-investigation):**

- Native: plugins/withAudioSession.js injects setCategory(.playback, mode: .default, options: [.mixWithOthers]) + setActive(true) into AppDelegate at launch via BEGIN/END markers.
- JS: setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'duckOthers' }) at module load in RunningScreen.js.
- Per-player: every useAudioPlayer call passes { keepAudioSessionActive: true } — without this, expo-audio deactivates the session after each beep.
- Silence track: 60-min 110 Hz sine at 8 kHz, volume 0.05, played non-looped while workout runs. Required for background audio and Bluetooth A2DP routing. Non-looped because expo-audio's loop=true has a gap iOS treats as audio stopping. Non-zero volume because some BT speakers won't hold the route at volume 0. Non-zero PCM because iOS cuts the stream after a short delay if samples are all zero.
- Full investigation: memory/project_bluetooth_audio_log.md