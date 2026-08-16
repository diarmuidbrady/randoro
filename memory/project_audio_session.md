---
name: Audio Session Findings
description: iOS audio session investigation — A3102 speaker routing + background audio failures, what's ruled out, current state
type: project
originSessionId: f6af4c52-f7f5-4ecc-aa25-f08d8e9a473d
---
Two interrelated bugs investigated late April / early May 2026. Both are blockers for the next TestFlight release.

**Bug 1 — Anker Soundcore A3102 speaker doesn't accept Randoro alone.**
- Anker Q45 headphones work fine with the same code path.
- A3102 only accepts Randoro audio when an anchor app (Spotify, Apple Music) is *actively pumping audio* through the speaker. Randoro then piggybacks the route.
- When the anchor stops, Randoro audio stops on the speaker.
- iOS makes a per-session routing decision. Apple Music gets the route; Randoro alone does not.

**Bug 2 — Background/lockscreen audio fails.**
- Confirmed at 2-second beep intervals, ruling out "long gaps" as the cause.
- iOS only keeps an app alive in background while audio samples are *actively flowing*. Active session ≠ active playback.
- Between beeps no samples flow → iOS suspends the app → setInterval stops → no further beeps.

**Current code state (in place, but not sufficient):**
- `plugins/withAudioSession.js` — config plugin, injects `setCategory(.playback, mode: .default, options: [])` + `setActive(true)` into AppDelegate. BEGIN/END markers for idempotent re-injection. Includes `NSLog` diagnostic of `currentRoute.outputs` at launch.
- `RunningScreen.js` — `setAudioModeAsync` at module load with `playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'doNotMix'`.
- `RunningScreen.js` — every `useAudioPlayer` call has `{ keepAudioSessionActive: true }`.
- `app.json` — `UIBackgroundModes: ["audio"]`. Confirmed propagated to `ios/randoro/Info.plist`.

**Things ruled out (don't waste time re-trying):**
- Missing native `setCategory` call — verified compiled and runs at launch
- Speaker can't receive iOS audio — Apple Music plays through it fine
- `.allowBluetoothA2DP` is required — Apple docs confirm it's redundant for `.playback` (A2DP routes by default for that category)
- Missing `UIBackgroundModes:audio` — confirmed present in Info.plist
- `shouldPlayInBackground=false` alone — necessary but not sufficient (without it, expo-audio's `OnAppEntersBackground` hook actively pauses all players)
- `keepAudioSessionActive=false` alone — necessary but not sufficient (without it, expo-audio's `onPlaybackComplete` calls `setActive(false)` between beeps)
- "Long gaps between beeps" — 2s gaps still fail
- `.mixWithOthers` is required — actually the *opposite*: it's what was breaking A3102 routing

**Key finding — `.mixWithOthers` blocks A2DP routing on some devices.**
- A3102 won't route audio to a session that has `.mixWithOthers` set. Q45 headphones don't show this constraint.
- The hypothesis is iOS treats `.mixWithOthers` sessions as "non-primary" and some Bluetooth devices won't auto-route to them.
- Trade-off: with `.mixWithOthers` removed, opening Randoro pauses Spotify (no longer mixes). Spotify auto-resumes after Randoro starts playing (observed). Acceptable for the gym scenario.

**expo-audio internals worth knowing (from `node_modules/expo-audio/ios/AudioModule.swift`):**
- `OnAppEntersBackground { if !shouldPlayInBackground { pauseAllPlayers() } }` — explicitly pauses on background unless flag is set.
- `useAudioPlayer` defaults `keepAudioSessionActive: false`. When false, `onPlaybackComplete` calls `deactivateSession()` → `setActive(false)` after every sound.
- `setAudioModeAsync` ALWAYS rebuilds the AVAudioSession category. With `interruptionMode: 'doNotMix'`, options become empty (`[]`). This matches our native config and doesn't reintroduce `.mixWithOthers`.

**Most promising next step — silent audio loop (not yet implemented):**
- Generate `silence.wav` (1 second of zero-amplitude PCM, ~88 KB) via `scripts/generate-sounds.js`
- Create a `silencePlayer` in `RunningScreen.js`: `loop = true`, `volume = 0`
- Start on workout begin, stop on unmount
- Continuous audio production satisfies iOS background mode, keeps the app alive
- Standard pattern in interval timer apps (Tabata Pro, HIIT timers, sleep apps)
- May incidentally fix Bug 1 too — continuous audio output may "claim" the A3102's A2DP route

**If silent loop fixes background but not A3102, try in order:**
1. `MPNowPlayingInfoCenter` registration to elevate session to "primary"
2. `setPreferredOutput` to force route to BT speaker
3. Brief audible-but-quiet ping at workout start to claim the A2DP route

**Why this memory exists:** This investigation took many rounds. The journey log is in chat history; this memory is the takeaways future sessions need.

**How to apply:** Before changing audio session config, check this memory and the "ruled out" list. If touching the silent-loop implementation, follow the pattern above. If exploring why something was decided, the answer is probably in this memory or `project_technical.md`.
