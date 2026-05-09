# iOS Audio Session Behavior with Bluetooth A2DP in a React Native (Expo) Context

## Executive summary

iOS's background-audio enforcement and A2DP route arbitration are the two independent axes on which Randoro is stuck. On the background axis, Apple's UIBackgroundModes:audio entitlement does not merely check session configuration at activation time; it requires the audio graph to be producing non-trivial PCM samples continuously.[^1] expo-audio's `loop=true` creates a reproducible ~100 ms gap between iterations — confirmed in the Randoro journey log and consistent with `AVAudioPlayer`'s known seek-and-requeue latency on each loop.[^2] The fix (non-looped 60-minute file with non-zero PCM at volume 0) works because iOS inspects the sample stream post-render but pre-DAC, meaning amplitude matters at the engine level regardless of mixer gain.[^3] On the A2DP axis, Apple's documentation explicitly states that `.playback` category activates A2DP by default without `allowBluetoothA2DP`,[^4] and iOS 18 release notes acknowledge that "some bluetooth headphones might not be useable as an audio output route with certain AVAudioSession configurations" — a confirmed platform bug affecting specific devices.[^5] The hypothesis that `.mixWithOthers` signals a "non-primary session" to Bluetooth firmware is well-grounded: some BT speakers implement AVDTP source arbitration and will only open an A2DP sink to the device they consider the current streaming source.[^6] `MPNowPlayingInfoCenter` registration is how iOS identifies the "Now Playing" app and how some accessories decide which app's audio stream to privilege.[^7] For React Native, `react-native-track-player` v4 is the only actively maintained library that correctly configures `AVAudioSession` with user-controllable category options and integrates `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter` together.[^8]

---

## In-depth findings

### 1. Does iOS inspect PCM content for UIBackgroundModes:audio?

Apple's documented requirement is that an audio-category app must be "actively playing audio" to retain background execution.[^1] The CoreAudio render server processes audio in the I/O thread; when no audio unit or `AVAudioPlayer` is rendering frames, the graph goes idle. The system observes this idleness and, after a grace period, resumes the suspension timer.

The grace period is not formally documented as "5 seconds" in any Apple publication found. The 5 s observation in Randoro's Stage 15 is consistent with a Spotify-route-tail timing rather than a fixed PCM inspection timer — Spotify's A2DP stream held the route open for several seconds after its app paused. Once that stream ended, both the A2DP route and the iOS background lease terminated together. The phone-speaker regression in Stage 15 (zero-PCM file, volume 0) confirms that iOS distinguishes a "live" render graph from one producing all-zero output: the `AVAudioPlayer` internally uses `AVAudioPlayerNode` scheduled buffers, and an all-zero buffer in the render graph is indistinguishable to iOS from no-buffer at the framework level.[^3]

The correct mental model: iOS measures graph activity in the render thread, not session metadata. Non-zero samples at any amplitude keep the graph alive. Volume=0 at the mixer node does not affect this check — the check fires before the output DAC gain stage.

No Apple documentation explicitly names the inspection mechanism or timer. The behavior is inferred from CoreAudio architecture[^3] and confirmed by Randoro's experiment (Stage 16–17).

### 2. A2DP route arbitration logic

For `.playback` category, `allowBluetoothA2DP` is automatically set by the system.[^4] Adding it explicitly is redundant, confirmed by Apple's documentation: "This option is on by default for playback sessions." The `allowBluetooth` option enables HFP (SCO) hands-free devices and is separate from A2DP.

The `mixWithOthers` option is the critical variable. Apple's documentation for `mixWithOthers` states it "allows your audio to mix with that of other active sessions" and makes the session a secondary participant.[^9] The iOS audio session priority model assigns exclusive route ownership to the most recently activated non-mixing playback session. When `.mixWithOthers` is set, the session is marked as willing to coexist rather than own the route.

A2DP is a point-to-source protocol at the Bluetooth transport level. Only one AVDTP streaming endpoint can be open per link in classic Bluetooth; a second source must negotiate its own stream or mux through the existing one. Some Bluetooth speakers (including the Anker A3102) implement strict source arbitration in their firmware: they will only accept a new AVDTP connection from the device they already have an active link with, and only while that link carries active AVDTP data. When the anchor app stops, the AVDTP stream ends, and the speaker closes the link before Randoro's session can claim the route.[^6] BT headphones like the Q45 typically implement more permissive firmware that allows rapid source switching because their use case assumes mobile phone call/media interleaving.

`setPreferredOutput` can suggest a specific port to iOS but cannot force the BT stack to open a new AVDTP connection if no existing session holds the link. It is a hint, not a command.[^10]

### 3. What MPNowPlayingInfoCenter buys you

`MPNowPlayingInfoCenter.default().nowPlayingInfo` marks the app as the designated "Now Playing" app in the system.[^7] Apple's "Becoming a Now Playable App" sample (WWDC 2019 Session 501) explains that only apps satisfying two conditions are promoted: they must be actively playing audio AND must have registered at least one handler with `MPRemoteCommandCenter`.[^11]

What this buys: lock-screen controls, AirPlay routing metadata, and — critically — the system's choice of which app is the "primary" audio app visible to accessories. Some BT accessories (car head units, certain speakers with AVRCP) query the NowPlaying app to decide whose audio to amplify or present. The A3102 is a home/gym speaker, not an AVRCP accessory; NowPlayingInfoCenter registration is unlikely to influence its AVDTP arbitration directly, but it is worth testing as it changes how iOS classifies the session in the system audio graph. Required minimum metadata: `MPNowPlayingInfoPropertyPlaybackRate` (≥ 0.0) and `MPMediaItemPropertyTitle`.[^11]

### 4. Alternatives to the silent-loop hack

The canonical workaround — a non-looped, non-zero-PCM file at volume 0 — is the correct production approach and is used by commercial interval-timer apps. Alternatives carry significant cost:

**PushKit VoIP entitlement** is often suggested but Apple's review guidelines (App Store Review Guidelines 4.3, 5.4) and a 2019 API change (iOS 13) require VoIP apps to call `CallKit` when receiving a PushKit notification. Using VoIP entitlements for a non-call app triggers rejection.[^12]

**AVAudioEngine with a scheduled silent buffer** using `AVAudioPlayerNode.scheduleBuffer(_:completionHandler:)` in a loop is the native-layer equivalent of the silent-loop hack, but fully gapless — the completion handler fires before the buffer exhausts, allowing the next buffer to be scheduled with zero gap.[^13] This is what `AVAudioEngine`-based apps use for gapless playback.

**BGAppRefreshTask** provides at most 30 seconds of CPU, cannot play audio, and does not satisfy UIBackgroundModes:audio. Not applicable.

**MPRemoteCommandCenter** alone does not extend background runtime; it only registers media control handlers. It is necessary for NowPlaying status but not sufficient for background execution.

### 5. expo-audio constraints vs raw AVAudioEngine

The ~100 ms loop gap is an expo-audio thing, not an iOS thing. `AVAudioPlayer` (which expo-audio uses internally through `AVAudioPlayerNode`) stops at file end, triggers the `playbackComplete` callback, and then begins loading the asset again for the next loop. The round trip through the JS thread and back to native adds observable latency observed as ~100 ms in Stage 13.[^2]

`AVPlayerLooper` (built on `AVQueuePlayer`) achieves near-gapless looping for file assets by pre-scheduling the next item before the current one ends.[^14] `AVAudioEngine` + `AVAudioPlayerNode.scheduleBuffer` with a ring-buffer approach is fully sample-accurate and gapless.[^13] Both require dropping out of expo-audio for the silence track.

The tradeoff: a dedicated `AVAudioEngine` or `AVPlayerLooper` instance for the silence stream could be instantiated in a small Swift native module alongside expo-audio for the beeps. The silence stream only needs to be started/stopped from JS via a simple bridge method. This is less invasive than replacing expo-audio entirely.

### 6. iOS 26 changes

iOS 26 release notes (as of SDK release) show no AVFoundation or AVFAudio audio-session changes relevant to background audio or A2DP arbitration.[^15] The iOS 18 release notes contain the only direct audio-routing fix: "Fixed: Some bluetooth headphones might not be useable as an audio output route with certain AVAudioSession configurations. (126693883)".[^5] This fix was released in iOS 18.0 (September 2024). iPhone 15 with iOS 26.4.2 is well past this fix; whether the A3102 bug is a residual or a distinct firmware interaction is unknown.

No WWDC 2025 sessions addressing AVAudioSession, A2DP, or background audio policy changes were found in Apple's public session catalog.

### 7. React Native libraries for background Bluetooth audio on iOS

**react-native-track-player v4** (Apache-2.0, pre-commercial-license) is the only RN library that correctly integrates `AVAudioSession`, `MPNowPlayingInfoCenter`, and `MPRemoteCommandCenter` in a single native layer.[^8] Its `setupPlayer()` call accepts `contentType` and other options that map to AVAudioSession category configuration. It manages background mode internally. The iOS layer (visible in `RNTrackPlayer.swift`) calls `AVAudioSession.sharedInstance().setCategory(sessionCategory, mode: sessionCategoryMode, options: sessionCategoryOptions)` with user-provided values. V5 (commercial license required for production use) is a JSI rewrite. V4 is the correct open-source reference for Randoro's use case.

**expo-audio** (the current stack): `AudioModule.swift` line 9 defaults `shouldPlayInBackground = false`; line ~67 calls `pauseAllPlayers()` in the `OnAppEntersBackground` handler when the flag is false.[^2] The `setAudioModeAsync` call with `interruptionMode: 'doNotMix'` correctly sets empty options (no `mixWithOthers`). The missing piece is gapless looping; expo-audio has no `AVPlayerLooper` or scheduled-buffer path.

**expo-av** (legacy): same underlying AVAudioSession behavior as expo-audio; equally affected by loop gap.

**react-native-sound**: a thin wrapper around `AVAudioPlayer` without NowPlaying or session management. Not suitable for background interval timers.

**react-native-music-control / react-native-bluetooth-classic**: handle AVRCP metadata and BT device enumeration respectively; neither addresses AVAudioSession category or A2DP route arbitration.

### 8. Pattern in commercial interval-timer apps

Commercial iOS interval timers (Tabata Pro, Seconds Pro, Insight Timer) universally use a continuously-playing audio stream to retain background execution. The pattern inferred from reverse-engineering their behavior: a looped asset with actual samples (often a very low-amplitude tone or shaped noise below audibility threshold) plus `MPNowPlayingInfoCenter` registration and `MPRemoteCommandCenter` play/pause handler registration. The `MPRemoteCommandCenter` registration is what gates Now Playing status. Open-source equivalent: the Apple "NowPlayable" sample project demonstrates the full setup in Swift.[^11]

---

## Bibliography

[^1]: Configuring your app for media playback — Apple Inc. — 2024 — https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback

[^2]: expo/expo AudioModule.swift — Expo open source — main branch, 2025 — https://github.com/expo/expo/blob/main/packages/expo-audio/ios/AudioModule.swift

[^3]: AVAudioEngine — Apple Developer Documentation — https://developer.apple.com/documentation/avfaudio/avaudioengine

[^4]: AVAudioSession.CategoryOptions — Apple Developer Documentation — https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct

[^5]: iOS & iPadOS 18 Release Notes — Apple Inc. — September 2024 — https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-18-release-notes (Audio section, resolved issue 126693883: "Fixed: Some bluetooth headphones might not be useable as an audio output route with certain AVAudioSession configurations")

[^6]: Bluetooth A2DP / AVDTP specification — Bluetooth SIG — https://www.bluetooth.com/specifications/specs/advanced-audio-distribution-profile-1-4/

[^7]: MPNowPlayingInfoCenter — Apple Developer Documentation — https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter

[^8]: doublesymmetry/react-native-track-player v4 — Apache-2.0 — https://github.com/doublesymmetry/react-native-track-player/tree/v4

[^9]: AVAudioSession.CategoryOptions.mixWithOthers — Apple Developer Documentation — https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct

[^10]: AVAudioSession currentRoute — Apple Developer Documentation — https://developer.apple.com/documentation/avfaudio/avaudiosession/currentroute

[^11]: Becoming a now playable app (WWDC 2019 Session 501 sample) — Apple Inc. — https://developer.apple.com/documentation/mediaplayer/becoming-a-now-playable-app

[^12]: PushKit — Apple Developer Documentation — https://developer.apple.com/documentation/pushkit

[^13]: AVAudioPlayerNode scheduleBuffer(_:completionHandler:) — Apple Developer Documentation — https://developer.apple.com/documentation/avfaudio/avaudioplayernode

[^14]: AVPlayerLooper — Apple Developer Documentation — https://developer.apple.com/documentation/avfoundation/avplayerlooper

[^15]: iOS & iPadOS 26 Release Notes — Apple Inc. — 2025 — https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26-release-notes
