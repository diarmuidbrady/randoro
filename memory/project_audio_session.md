---
name: Audio Session Findings
description: iOS audio session investigation — A3102 speaker routing + background audio failures, what's ruled out, current state
type: project
---

Two interrelated bugs investigated late April / early May 2026. As of end of Session 2 (2026-05-07): Bug 2 is FIXED for the default output (phone speaker). Bug 1 (A3102 alone) remains open.

**Bug 1 — Anker Soundcore A3102 speaker doesn't accept Randoro alone. (OPEN)**
- Anker Q45 headphones work fine with the same code path.
- A3102 only accepts Randoro audio when an anchor app (Spotify, Apple Music) is *actively pumping audio* through the speaker. Randoro then piggybacks the route.
- When the anchor stops, Randoro audio stops on the speaker.
- Even with the silent-loop hack in place (real PCM content, volume=0), Randoro still cannot claim the A2DP route from cold on the A3102. The hack solved Bug 2 but did not incidentally fix Bug 1.

**Bug 2 — Background/lockscreen audio fails. (FIXED for phone speaker)**
- Was: between beeps no samples flow → iOS suspends app → setInterval stops → no further beeps.
- Fixed by: continuous non-zero-PCM audio stream playing alongside the beeps (silent-loop hack with real content). See "Silent-loop hack" section below.
- iOS UIBackgroundModes:audio requires *real* flowing samples, not just an active session — and not zero-PCM either. iOS inspects the audio stream content after a ~5 s grace period.

**Current code state (uncommitted on dev branch as of end of Session 2):**
- `plugins/withAudioSession.js` — config plugin, injects `setCategory(.playback, mode: .default, options: [])` + `setActive(true)` into AppDelegate. BEGIN/END markers for idempotent re-injection. Includes `NSLog` diagnostic of `currentRoute.outputs` at launch.
- `RunningScreen.js` — `setAudioModeAsync` at module load with `playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'doNotMix'`.
- `RunningScreen.js` — every `useAudioPlayer` call has `{ keepAudioSessionActive: true }`.
- `RunningScreen.js` — `silencePlayer` (silent-loop hack): `useAudioPlayer(silence.wav, { keepAudioSessionActive: true })`, `loop=false`, `volume=0`, `seekTo(0)` + `play()` on isRunning=true, `pause()` on cleanup. try/catch around play/pause to absorb NativeSharedObjectNotFoundException when iOS or Fast Refresh reaps the native player.
- `scripts/generate-sounds.js` — refactored. `buildBeepsWav` at 44.1 kHz for the four beep files. `buildSilenceWav` at 8 kHz mono generates 60 min of 110 Hz sine at amplitude 0.05 (low PCM content). Shared `writeWavHeader`.
- `assets/sounds/silence.wav` — 57.6 MB, untracked, regenerated from script.
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
- **expo-audio `loop=true` is gapless** — false. ~100 ms restart latency between iterations. Use a single long file instead.
- **Zero-PCM silence satisfies iOS background mode** — false. iOS inspects PCM content after a ~5 s grace period and rejects silent streams. Need real samples in the file (volume can still be 0).
- **iOS aggressively suspends backgrounded audio** — false. With real continuous samples, iOS keeps the app alive indefinitely (confirmed during 60s no-loop drone test).

**Key finding — `.mixWithOthers` blocks A2DP routing on some devices.**
- A3102 won't route audio to a session that has `.mixWithOthers` set. Q45 headphones don't show this constraint.
- The hypothesis is iOS treats `.mixWithOthers` sessions as "non-primary" and some Bluetooth devices won't auto-route to them.
- Trade-off: with `.mixWithOthers` removed, opening Randoro pauses Spotify (no longer mixes). Spotify auto-resumes after Randoro starts playing (observed). Acceptable for the gym scenario.

**expo-audio internals worth knowing (from `node_modules/expo-audio/ios/AudioModule.swift`):**
- `OnAppEntersBackground { if !shouldPlayInBackground { pauseAllPlayers() } }` — explicitly pauses on background unless flag is set.
- `useAudioPlayer` defaults `keepAudioSessionActive: false`. When false, `onPlaybackComplete` calls `deactivateSession()` → `setActive(false)` after every sound.
- `setAudioModeAsync` ALWAYS rebuilds the AVAudioSession category. With `interruptionMode: 'doNotMix'`, options become empty (`[]`). This matches our native config and doesn't reintroduce `.mixWithOthers`.
- `loop=true` is NOT gapless — there's a ~100 ms restart latency between iterations. Don't rely on it for "continuous audio" in background-mode tricks.
- The native player object can be reaped during Fast Refresh or extended background. Calling `.play()`/`.pause()` on a stale JS handle throws `NativeSharedObjectNotFoundException`. Wrap in try/catch defensively.

**Silent-loop hack — implemented in Session 2, partial success:**
- `silencePlayer` in `RunningScreen.js` plays a 60-min, 8 kHz, low-amplitude 110 Hz sine file at volume=0 while `isRunning` is true
- Two non-obvious requirements learned the hard way:
  1. **No loop.** expo-audio's `loop=true` has a ~100 ms restart gap that iOS reads as "audio stopped." Use a single long file. (Stage 13–14)
  2. **Real PCM content.** iOS inspects the audio stream and rejects zero-PCM as "not really playing audio" after ~5 s. Real samples + volume=0 is the magic combo: iOS sees content, user hears nothing. (Stage 15–17)
- Outcome: Bug 2 fully fixed for phone speaker (foreground, background, lock screen, with/without Spotify). Bug 1 (A3102 alone) NOT fixed.

**iOS PCM content inspection (~5 s grace period) — key new finding from Session 2:**
- After ~5 s of audio output, iOS examines the stream's actual sample values. Zero-PCM is treated as inactive playback.
- The 5 s timer is observable: with a zero-PCM silence file and Spotify as anchor, audio plays for exactly 5 s on the A3102 then drops out as iOS releases the route.
- Implication for any future audio code: a "silent" track for background-mode tricks needs *real* sample content, not literal zeros. Volume can be 0 to silence the user-facing output.

**Bug 1 — A3102 alone — still open. Try in order:**
1. `MPNowPlayingInfoCenter` registration to elevate session to "primary" — speakers like A3102 may refuse routing to non-primary sessions
2. `setPreferredOutput` to force route to BT speaker
3. Brief audible-but-quiet ping at workout start to claim the A2DP route, then rely on silent loop to hold it open

**Why this memory exists:** This investigation took many rounds. The journey log is in chat history; this memory is the takeaways future sessions need.

**How to apply:** Before changing audio session config, check this memory and the "ruled out" list. If touching the silent-loop implementation, follow the pattern above. If exploring why something was decided, the answer is probably in this memory or `project_technical.md`.
