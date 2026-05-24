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

**Combo Count label:** Renamed from "Punches" to "Combo Count". Options are 1-2, 3-4, 5-6+. Tooltip text: "Controls time given to react with punch combo. Longer combos means more time." COMBO_MAP keys remain '1-2', '3-4', '5-6+'.

**Info tooltips:** A single shared Modal controlled by tooltipKey state (null | 'intensity' | 'combo'). Tapping ? next to Intensity or Combo Count sets the key; tapping the overlay clears it. Dark card (#0b0f18), red accent dot, setting name header, body text opacity 0.7, overlay rgba(0,0,0,0.3). Custom workout option removed entirely — presets only.

**Sound picker removed:** soundChoice state, SOUND_OPTIONS import, and sound picker UI removed from SetupScreen. RunningScreen always uses ping sound. SOUND_OPTIONS removed from theme.js.

**Home screen (HomeScreen.js):** Added as first screen in the stack navigator. Three-phase animation:
- Phase 1: A dot (solid white circle, 10px) travels from off-screen left across the title. As it passes each static letter (r,a,n,d,o,r), the letter fades in with a 110ms delay. The dot follows a QRS-inspired heartbeat path (sine + heartbeat segments, controlled by HB_WIDTH, SINE_CYCLES, HB_AMP_MULT, HEARTBEAT_CYCLES). On landing, dot expands to 'o' size then crossfades to the settled 'o' text.
- Phase 2: Divider appears instantly, "react" flashes (opacity 1→0.6), "to the" steps in, "unpredictable" flashes, then phase 3.
- Phase 3: SVG border traces around the button (strokeDashoffset animation), "Get Ready" fades in.
- Centering: invisible placeholder 'o' at position 6 gives the title row correct full width for centering.
- Tuning constants at top of file: TRAVEL_DURATION, WAVE_START_PROGRESS, O_START_X, O_END_X, DOT_END_X_OFFSET, DOT_SIZE, DOT_TO_O_SCALE, HB_WIDTH, SINE_CYCLES, HB_AMP_MULT, HEARTBEAT_CYCLES.

**Tagline:** "react to the unpredictable" — settled on after iterating through "react to what you can't predict", "react when you can't predict". Shorter and more direct.

**Button language by screen:** HomeScreen → "Get Ready", SetupScreen → "ENTER", RunningScreen → "BEGIN" / "PAUSE" / "RESUME".

**TestFlight workflow:** Archive in Xcode → Distribute → App Store Connect → Upload. Build number increments each archive. Version number stays at 1.0.0 until public App Store release.

**Audio session config (post-investigation):**

- Native: plugins/withAudioSession.js injects setCategory(.playback, mode: .default, options: [.mixWithOthers]) + setActive(true) into AppDelegate at launch via BEGIN/END markers.
- JS: setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'duckOthers' }) at module load in RunningScreen.js.
- Per-player: every useAudioPlayer call passes { keepAudioSessionActive: true } — without this, expo-audio deactivates the session after each beep.
- Silence track: 60-min 110 Hz sine at 8 kHz, volume 0.05, played non-looped while workout runs. Required for background audio and Bluetooth A2DP routing. Non-looped because expo-audio's loop=true has a gap iOS treats as audio stopping. Non-zero volume because some BT speakers won't hold the route at volume 0. Non-zero PCM because iOS cuts the stream after a short delay if samples are all zero.
- Full investigation: memory/project_bluetooth_audio_log.md