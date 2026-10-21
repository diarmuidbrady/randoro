---
name: Audio Session Findings
description: How Randoro's audio works on iOS and Android, why it's set up this way, and what's been ruled out
type: project
---
Current as of 21 Oct 2026. For the experiments behind the iOS setup, see [[project_audio_journey_log]].

## How it works now

**Audio mode** (App.js, at startup): `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'mixWithOthers' })`.
- `mixWithOthers`: beeps play over music instead of pausing it. On Android it also means expo-audio never requests audio focus.
- `shouldPlayInBackground`: without it, expo-audio pauses every player when the app backgrounds.
- `playsInSilentMode`: beeps sound with the iOS silent switch on.
- It's set at app start so the home-screen heartbeat uses it too.
- No native AppDelegate code. The `withAudioSession` plugin was removed on 15 Oct 2026 (journey log Stage 23).

**Players** (RunningScreen): every `useAudioPlayer` passes `keepAudioSessionActive: true`. With the default (false), iOS deactivates the session after each sound and suspends the app in the background.

**The drone** (`silence.wav`): a 5 min 110 Hz sine at amplitude 0.05, 8 kHz mono, played at volume 0.05.
- Audio must flow continuously for iOS to keep a backgrounded app alive and for Bluetooth to keep the route open. Beeps with gaps aren't enough.
- It isn't true silence: iOS drops an all-zero stream after about 5 s (Stage 15–16).
- It isn't volume 0: the A3102 speaker needed non-zero output (Stage 17–18).
- It isn't `loop=true`: expo-audio restarts a loop with a ~100 ms gap that iOS treats as audio stopping (Stage 13–14). Instead, two players hand over 3 s before the end.
- It plays for as long as the running screen is open, not just while the timer runs, because an idle Bluetooth output clips the first ~0.5 s of the next sound.

**Android background**
- React Native stops JS timers when the app is paused, so `setInterval` doesn't tick in the background. The drone players' status updates (every 100 ms) drive the tick instead.
- `pingPlayer.setActiveForLockScreen` starts expo-audio's media-playback foreground service, which keeps the process alive. It's on the ping player so the notification's play/pause button can't stop the drone.

**Android short-clip bug**: ExoPlayer writes a clip shorter than its audio buffer (up to 750 ms) completely while paused, then stops the track, so the first `play()` is silent. Every beep file is padded to 1 s. See [[project_technical]] for the mechanism.

**Bluetooth latency**: A2DP adds about 200 ms between `play()` and the sound (measured on a Galaxy A14). The ping's flash and haptic wait for the player's position to move, which ExoPlayer only reports once the sound is audible, with a 400 ms fallback.

## Ruled out (don't re-try)

- `.allowBluetoothA2DP`: redundant for `.playback`, where A2DP routes by default.
- A missing native `setCategory`, or a missing `UIBackgroundModes: audio`: both were confirmed present and weren't the cause.
- `shouldPlayInBackground` or `keepAudioSessionActive` alone: each is necessary, neither is sufficient.
- "Long gaps between beeps": background audio failed even with 2 s gaps.
- A true-silence or volume-0 drone, or `loop=true`: see above.

## expo-audio internals worth knowing (1.1.1)

- iOS `OnAppEntersBackground` pauses all players unless `shouldPlayInBackground` is set.
- `setAudioModeAsync` always rebuilds the whole AVAudioSession category.
- iOS `play()` activates the session itself.
- Android `seekTo` returns before the seek finishes. Status updates only fire while a player is playing, at its `updateInterval`.
- Debug playback with the `playbackStatusUpdate` listener, not by polling. See [[project_ghost_beep_fix]].

## Open questions

- `mixWithOthers` broke A3102 routing in Stage 5, and today's setup hasn't been re-tested on the A3102 with no other app playing.
- The two-player drone handover hasn't been tested on an iOS device.
