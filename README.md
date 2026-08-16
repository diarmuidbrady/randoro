# Randoro
A boxing interval timer that fires random audio cues so you have to react to the unpredictable.

## How it works

**Home screen** — an animated dot travels across the screen, revealing the letters of "randoro" as it passes. It lands, expands into an 'o', and the tagline fades in. Tap **Get Ready** to continue.

**Setup** — configure your session before starting:

- **Round Structure** — set warm-up, number of rounds, work duration, rest duration, and cool-down. Tap any duration to open a scroll wheel. The swap button (↔) flips whether work or rest comes first.
- **Workout Style** — two controls shape how the random cues fire:
  - *Intensity* — how often cues fire. Low fires infrequently, High fires constantly.
  - *Combo Count* — how much time you get after each cue to execute your combination. 1-2 punches gives a short window, 5-6+ gives a longer one.
- **Feedback** — toggle screen flash and vibration on each cue.

Tap **ENTER** to continue.

**Running** — the screen shows the current phase (warm-up, work, rest, cool-down), a large countdown, and elapsed/remaining time. Audio cues fire at random intervals within the bounds you set. On each cue:
- A beep plays
- The screen flashes (if enabled)
- The phone vibrates (if enabled)

Use the arrow buttons (‹ ›) to jump between phases. Tap **PAUSE** to pause mid-round and **RESUME** to continue. Tap ✕ to end early.

Audio continues in the background and on the lock screen, so it's safe to pocket the phone mid-session.

## Stack

React Native + Expo (SDK 54). iOS only. Android untested.

## Running locally

Prerequisites:

- Node 18+
- Xcode (current)
- A physical iPhone for testing (some audio behavior won't surface in the simulator)
- Apple Developer account configured in Xcode

Install dependencies:

```bash
npm install
```

Generate sound assets (one-time, or whenever `scripts/generate-sounds.js` changes):

```bash
node scripts/generate-sounds.js
```

Build and install on a connected iPhone:

```bash
npx expo run:ios --device
```

If you change `app.json` or anything under `plugins/`, regenerate native files first:

```bash
npx expo prebuild --platform ios
npx expo run:ios --device
```

### Expo Go vs the dev build

Randoro depends on native modules, notably `@react-native-picker/picker` (the
duration and rounds scroll wheels) and the AVAudioSession plugin. **These do not
work in Expo Go.** The picker wheels render as blank grey rows, and background
audio routing won't behave correctly.

Always run the app through the **dev build** produced by `npx expo run:ios`, not
Expo Go. Once the dev build is installed, `npx expo start` can serve JS reloads
to it for pure-JS changes (layout, styling, animations). But you must open the
**dev build** app on the device, not Expo Go. They look identical; only the dev
build has the native modules.

If the picker wheels show empty grey rows, you're running in the wrong runtime.
It's not a code bug. Delete Expo Go from the device to avoid connecting to it by
accident.

## Project structure

```
App.js                 Entry point
app.json               Expo config (plugins, permissions, identifiers)
index.js               Registers the root component

src/
  screens/
    HomeScreen.js      Animated landing screen (dot reveals "randoro", then Get Ready)
    SetupScreen.js     Workout configuration (rounds, work/rest duration, intensity, combo)
    RunningScreen.js   Workout execution with audio cues
  utils/
    generator.js       Builds the workout event timeline
    time.js            Time formatting / parsing
  constants/
    theme.js           Colors, intensity/combo presets

plugins/
  withAudioSession.js  Native plugin: AVAudioSession setup in AppDelegate

scripts/
  generate-sounds.js   Generates beep WAVs and the silence track

assets/sounds/         Generated WAV files (silence.wav is ~57 MB)
memory/                AI assistant context files (human-readable mirror)

TODO.md                Feature ideas, bugs, release tasks
USER_NEEDS.md          User needs behind the features
```

## Sound assets

Beep files (`ping`, `double`, `double_rest`, `warmup`, `cooldown`) generated at 44.1 kHz, 16-bit, mono PCM. Each is a harmonic-rich tone (odd harmonics over the fundamental) for perceived loudness, normalised to its true measured peak. The silence track is 60 minutes of low-amplitude 110 Hz sine at 8 kHz mono (~57 MB), played non-looped at low volume alongside the beeps. It keeps iOS's audio engine producing continuous samples, required for background-mode beeps to fire and to hold the A2DP route open on Bluetooth speakers.

Regenerate when the script changes:

```bash
node scripts/generate-sounds.js
```

## Navigating this repo

Top-level docs:

- [TODO.md](TODO.md) — distilled feature ideas, known bugs, and release tasks. Concise and processed, not a running log.
- [USER_NEEDS.md](USER_NEEDS.md) — the user needs behind the features. Kept separate so we solve problems, not just ship suggestions. Includes a dated list of user calls.

The `memory/` folder is dual-use: context written for an AI assistant between sessions, but all human-readable. It is a published mirror of the assistant's live memory, updated when things change. Start with the index:

- [memory/MEMORY.md](memory/MEMORY.md) — index of all memory files, grouped into living / about-the-user / reference.
- [memory/project_context.md](memory/project_context.md) — what Randoro is, current state, direction.
- [memory/project_technical.md](memory/project_technical.md) — stack and key technical decisions.
- [memory/project_audio_journey_log.md](memory/project_audio_journey_log.md) — full chronological record of the Bluetooth + background audio investigation.

## Known limitations (v1)

See [TODO.md](TODO.md) for the full list. Headlines:

- Spotify pauses when Randoro is opened. The user must resume it to continue listening.
