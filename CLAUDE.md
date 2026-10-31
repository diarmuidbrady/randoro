# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Randoro is a boxing interval timer (React Native + Expo SDK 54, plain JavaScript) that fires beeps at random times during work rounds. iOS is live on the App Store; Android is in beta testing on Google Play.

## Commands

There is no test suite, linter or TypeScript. Changes are checked by running the app on a physical device.

```bash
npm install
node scripts/generate-sounds.js   # writes assets/sounds/*.wav (gitignored); the build fails without them
npx expo run:ios --device         # build and install the dev build on an iPhone
npx expo run:android --device     # same for Android (needs JDK 17, Android SDK, NDK 27.1.12297006)
npx expo start                    # serve JS reloads to an installed dev build (pure-JS changes only)
```

- **Never use Expo Go.** It ignores the native config in `app.json` (`UIBackgroundModes: audio`, Android permissions), so background audio silently breaks there. Only the dev build from `expo run:*` behaves like the shipped app.
- `ios/` and `android/` are generated and gitignored. `app.json` changes (versionCode, permissions, plugins) reach them only through `npx expo prebuild`. `expo run:*` skips prebuild when the folder already exists.
- Android release: bump `android.versionCode` in `app.json`, run `npx expo prebuild --platform android`, then in `android/` run `./gradlew signingReport` (release must show the upload keystore) and `./gradlew bundleRelease`. `plugins/withSigningConfig.js` injects the release signing config from `~/.gradle/gradle.properties`.
- iOS release: Xcode → Archive → Distribute. Raise `version` in `app.json` above the released version first.
- Re-run `generate-sounds.js` after editing it. `scripts/make-heartbeat.sh` regenerates the tracked `assets/heartbeat.wav`.
- `assets/randoro-icon.svg` is the icon source. `scripts/make-icons.sh` (needs Google Chrome and ffmpeg) renders the iOS icon, the Android adaptive icon layers and both splash images from it. Android shows only the middle two-thirds of an adaptive icon, so the foreground must be the trace shrunk onto a transparent canvas, not the full iOS square.
- `scripts/store-screenshots.sh` captures the App Store screenshots on the iOS simulators, unattended, through the Maestro flow in `.maestro/` (`brew install mobile-dev-inc/tap/maestro`). Update the flow's text when screen labels change.

## Architecture

Three screens on a stack navigator (`App.js`): Home → Setup → Running. A tutorial modal, HowItWorks, opens from Setup's "How it works" link, and once automatically: it sets the `tutorialSeen` AsyncStorage flag when it opens. Its sound demos play the silence drone so Bluetooth doesn't clip them.

**The workout is precomputed.** `SetupScreen` turns the user's choices into a config. The Workout Style card has three tabs. **Preset** (the default) maps Intensity to `avgFrequency` and Attack Length to `minGap` through `INTENSITY_MAP` / `COMBO_MAP` in `src/constants/theme.js`. **Manual** sets the execution time (`minGap`) and either the avg. anticipation time or the attacks per round, and passes the count as `pingCount`. If the attacks don't fit (`maxPings` in the generator), it shows an error and blocks Start rather than changing any value. Switching between Preset and Manual carries the values across. **Simple** sends `randomBeeps: false` and turns off flash and vibration. It calls `generateWorkout()` in `src/utils/generator.js` and passes the result to `RunningScreen` as a route param. The workout has three parts:
- `phases`: contiguous `{ type, start, end, label, round? }` spans (warmup, rest, work, cooldown, and a zero-length `done`).
- `events`: a time-sorted list of `{ time, type }` (`ping`, `round_start`, `rest_start`, `warmup_start`, `cooldown_start`, `warning`, `countdown`, `done`). These decide which sound plays.
- `totalDuration`.

Ping placement: n pings make n + 1 gaps. Each gap is `minGap` (combo/execution time, fixed) plus a random wait (anticipation) that averages about `avgFrequency`. The two are independent, and no ping lands on a round edge. On average, round length = (n + 1) × (`minGap` + wait). Manual caps n so the average wait stays at least 1 s. `randomBeeps: false` (the Simple tab) skips pings entirely. Countdown beeps (`COUNTDOWN_BEEPS`: a `warning` 10 s out, then a `countdown` at 3-2-1) play in the phase before a work round. Beeps that don't fit in that phase are dropped, and back-to-back work rounds get none.

**RunningScreen is a 100 ms tick loop over that timeline.** Each tick computes elapsed time from wall-clock refs (`startTimeRef`, `pausedElapsedRef`). It then fires every event in `(lastEventElapsedRef, current]`. If more than 1 s passed since the last tick, the app was backgrounded: the tick catches up silently, with no sounds or haptics. Phase jumping and pause/resume work by rewriting those refs. The phase display and the round's beep count ("2 of 3 beeps") are derived from `elapsed` and never stored.

## Audio constraints (read before touching audio)

The current setup came out of a long device-testing investigation. `memory/project_audio_session.md` explains each piece and lists approaches that are **ruled out, don't re-try**. Every one of these is load-bearing:

- `setAudioModeAsync` runs once at app start in `App.js` (`mixWithOthers`, `shouldPlayInBackground`, `playsInSilentMode`). Every player passes `keepAudioSessionActive: true`.
- A near-silent 110 Hz drone (`silence.wav`) plays on two players that hand over 3 s before the end. It runs for as long as RunningScreen is mounted, not only while the timer runs. This keeps iOS background playback alive and the Bluetooth route open. Don't change it to true silence, volume 0, or `loop = true`; all three fail.
- On Android, JS timers stop in the background, so the drone players' `playbackStatusUpdate` events drive `tick` (through `tickRef`). `pingPlayer.setActiveForLockScreen` starts the foreground service that keeps the process alive. It sits on the ping player, not the drone, on purpose.
- `playSound` must `await player.seekTo(0)` before `play()`. Skipping the await caused the "ghost beep" (flash with no sound).
- Every beep WAV is padded to 1 s, because ExoPlayer plays nothing on the first play of a shorter clip.
- The ping's flash and haptic wait for the player's position to advance, with a 400 ms fallback, so they line up with ~200 ms of Bluetooth latency.
- Debug playback with the `playbackStatusUpdate` listener, not by polling `player.playing`.

Use `expo-audio`, never `expo-av`, which is deprecated and adds a microphone permission. `expo-asset` is pinned to `~12.0.13` on purpose. Recording and storage permissions are blocked in `app.json`. Keep them blocked.

## Other non-obvious decisions

- **Home animation** (`HomeScreen.js`) runs on the native driver from a single `progress` value. On Android the native clock starts at the first UI frame, which can come well after mount. Anything that must line up with the dot (letter reveals, the heartbeat sound) has to key off the dot's animated value, not JS timers started at mount. The trace is the app icon's ECG. The trail is static SVG strokes, drawn up to the dot by a native-animated `strokeDashoffset` and faded by a background-coloured overlay, so it relies on the screen's solid background.
- **WheelPicker** is a pure-JS ScrollView wheel, so it's the same on iOS and Android. It handles both `onMomentumScrollEnd` and `onScrollEndDrag`, because Android skips the momentum event after a slow drag.
- **Dynamic Type:** text scales by default. Make layouts absorb it (`flexShrink`, `flexWrap` + `minWidth`). Use `numberOfLines={1}` + `adjustsFontSizeToFit` only for short fixed-format strings such as times and button captions. Use `maxFontSizeMultiplier` caps only on the wordmark (1x), icon glyphs (2x), the GET READY label (2x) and WheelPicker labels (1.5x), never on informational text. Details are in `memory/dynamic-type-changes.md`.

## Repo docs

- Keep every doc (CLAUDE.md, README, `memory/`, TODO) concise, clear and minimal. Say each thing once, in plain words, and leave out what the code already shows. Current docs describe the app as it is and why. Leave out options that weren't taken; history belongs in the dated history files.

- `memory/` holds engineering notes and is published in the repo. `memory/memory.md` is the index. "Current" files are kept in step with the code. "History" files are dated records the code may have moved past. Update the current files when behaviour they describe changes. `memory/user_profile.md` and `memory/feedback_collaboration.md` are gitignored personal notes. Keep personal content out of the tracked files.
- Releases follow the `release` skill (`.claude/skills/release/`). `CHANGELOG.md` records what shipped in each version; `store/` holds the App Store and Play listing text; its screenshots are generated by the script above and gitignored.
- `TODO.md` holds distilled feature ideas, bugs and release tasks. `USER_NEEDS.md` holds the needs behind them. Treat both as a considered backlog, not a build queue.
- Product constraint: keep the app simple. A user should start a workout in a few taps, and any added depth stays optional and off the common path.
