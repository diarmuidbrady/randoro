# Randoro Bluetooth Audio Journey Log

A chronological record of every distinct phase in solving (or attempting to solve) two problems:

1. Audio not routing to the Anker Soundcore A3102 Bluetooth speaker
2. Background/lockscreen audio failure

---

## Session 1 — Initial investigation

### Stage 1: Initial brief

**Situation.** Randoro audio does not route to Anker Soundcore A3102 speaker. Works on iPhone earpiece and Anker Q45 headphones. Stack: Expo SDK 54, expo-audio 1.1.1. expo-audio doesn't expose `.allowBluetoothA2DP`.

**Assessment.** Need to set AVAudioSession category natively. User came in with a recommendation from a prior chat to write a full native module (Swift + .m bridge + config plugin + JS hook).

**Change made.** None yet — scouting only.

**Decision rationale.** Discovered `/ios` is gitignored, so any change must survive `expo prebuild`. Chose `withAppDelegate` config plugin (inject straight into `AppDelegate.swift`) over a full NativeModule + JS bridge. Simpler, fewer files, runs at launch before any RN code can interfere.

**Outcome.** Plan committed.

### Stage 2: First implementation — mixWithOthers + allowBluetoothA2DP

**Situation.** Need native `AVAudioSession.setCategory` to run before any expo-audio code touches the session.

**Change made.**

- Created `plugins/withAudioSession.js` — injects `setCategory(.playback, mode: .default, options: [.mixWithOthers, .allowBluetoothA2DP])` and `setActive(true)` into `didFinishLaunchingWithOptions`
- Registered plugin in `app.json`
- Removed `setAudioModeAsync` call from `RunningScreen.js` (was setting category without `.allowBluetoothA2DP` and would clobber ours)
- Fixed duplicate `"audio"` in `UIBackgroundModes`
- Ran `npx expo prebuild --platform ios` (no `--clean` to preserve `ENABLE_USER_SCRIPT_SANDBOXING=NO`)
- Verified Swift compiles via `xcodebuild`

**Decision rationale.** AppDelegate runs once at launch, before any expo-audio module loads. Plugin uses a marker comment for idempotent injection. Avoiding `--clean` preserves manual sandbox setting.

**Outcome.** Code compiled, installed on device via `expo run:ios --device`. Test failed — same behavior as before, no audio through speaker.

**What this ruled out.** Not a missing native call, not a build/install issue.

### Stage 3: Diagnostic phase — localize the bug

**Situation.** Native config in place, speaker still silent. Source of failure unknown.

**Change made.** None — diagnostic questions only.

**Decision rationale.** Don't add more code until we know if the bug is even in our code path. Started narrowing with: cold launch confirmed? Spotify in the picture? AirPods test?

**Outcome.** User reported clean test (deleted app, fresh `expo run:ios --device`). Headphones (Anker Q45) work, speaker (Anker A3102) doesn't.

### Stage 4: Apple Music test — speaker works for some apps, not Randoro

**Situation.** Need to know whether the speaker can receive iOS audio at all.

**Change made.** None — asked user to play Apple Music with only the speaker connected.

**Decision rationale.** If Apple Music routes there, the bug is in our session config. If not, the speaker is an iOS-level pairing issue.

**Outcome.** User reported a full test matrix:

| Test | Result |
|---|---|
| Apple Music → A3102 speaker | ✓ |
| Randoro alone → A3102 speaker | ✗ |
| Music + Randoro mixed on speaker | only music plays, Randoro silent |
| Randoro → phone speaker | ✓ |
| Randoro → Q45 headphones | ✓ |

**Conclusion.** The route to the speaker IS available. iOS is making a per-session routing decision and choosing not to send Randoro's audio there.

### Stage 5: New hypothesis — .mixWithOthers blocks A2DP routing

**Situation.** iOS routes Apple Music to speaker but not Randoro, even concurrently. Difference: Apple Music's session likely uses `.playback` without `.mixWithOthers`; ours has it.

**Assessment.** `.mixWithOthers` may signal "non-primary session" to iOS, and the A3102 specifically may not accept non-primary audio. Q45 headphones don't show this quirk.

**Change made.**

- Updated `plugins/withAudioSession.js`: `options: []` (dropped both `.mixWithOthers` and `.allowBluetoothA2DP`)
- Switched plugin from single marker to BEGIN/END markers so re-runs replace the block instead of skipping
- Added `NSLog` diagnostic printing `currentRoute.outputs` at launch
- Manually cleaned up an orphan block left behind by the old single-marker style
- Re-ran `expo prebuild`

**Decision rationale.** Apple docs confirm `.allowBluetoothA2DP` is redundant for `.playback` (A2DP routes by default). Removing `.mixWithOthers` is a cheap, single-line test of the hypothesis. Begin/end markers make the plugin idempotent against future body changes.

**Outcome.** Major progress + new regression — see Stage 6.

### Stage 6: Major progress + background regression discovered

**Situation.** User ran a fresh test matrix on device. Results:

| # | Test | Result |
|---|---|---|
| 5 | Speaker, with Spotify: Spotify pauses on Randoro launch → start timer → Spotify resumes → both play through speaker | ✓ **BIG WIN** |
| 6 | Speaker: pause Spotify mid-workout → Randoro audio stops on speaker | ✗ |
| 7 | Speaker, no anchor: Randoro alone | ✗ silent |
| 9 | Headphones: app backgrounded → audio stops | ✗ **REGRESSION** |
| 10 | Phone speaker: app backgrounded → audio stops | ✗ **REGRESSION** |

**Assessment.** Two distinct issues:

1. **Speaker piggybacking only** — A3102 accepts Randoro only while another app is actively pumping audio through it; alone, route fails to open
2. **Background audio broken** — caused by removing `setAudioModeAsync` in Stage 2; lost expo-audio's `shouldPlayInBackground` internal flag

**Change made.** None yet — investigation phase.

**Decision rationale.** Need to fix the regression first (it's clearly self-inflicted) before tackling the harder A3102 problem.

**Outcome.** Investigation moved to expo-audio source.

### Stage 7: Investigation — expo-audio internals

**Situation.** Need to understand why removing `setAudioModeAsync` broke background.

**Change made.** Read `node_modules/expo-audio/ios/AudioModule.swift`.

**Findings.**

- Line 67: `OnAppEntersBackground { if !shouldPlayInBackground { pauseAllPlayers() } }` — confirms expo-audio actively pauses players on backgrounding when flag is false
- `shouldPlayInBackground` defaults to false, only flipped via `setAudioModeAsync`
- `setAudioModeAsync` ALWAYS rebuilds the category — but with `interruptionMode: 'doNotMix'` it produces `options: []`, identical to our native config
- Line 75: `useAudioPlayer` default `keepAudioSessionActive: false` — important for next stage

**Decision rationale.** Found a way to re-add `setAudioModeAsync` without re-introducing `.mixWithOthers`.

**Outcome.** Path to fix identified.

### Stage 8: Re-add setAudioModeAsync with safe params

**Change made.** Updated `RunningScreen.js`:

```js
setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  allowsRecording: false,
  interruptionMode: 'doNotMix',
});
```

**Decision rationale.** `'doNotMix'` produces empty options — same as native config, no speaker regression. `shouldPlayInBackground: true` flips the expo-audio internal flag.

**Outcome.** Background still broken. User: *"still doesn't work in the background or when screen is locked."*

**What this ruled out.** The `shouldPlayInBackground` flag alone is necessary but not sufficient.

### Stage 9: keepAudioSessionActive theory

**Situation.** Background still failing despite correct flag.

**Assessment.** Found in expo-audio source: after every beep finishes, `onPlaybackComplete` calls `deactivateSession()` → `setActive(false)` — UNLESS player was constructed with `keepAudioSessionActive: true`. Default is false. So between beeps, session deactivates → iOS suspends app under background mode → next setInterval doesn't fire.

**Change made.** Added `{ keepAudioSessionActive: true }` to all 4 `useAudioPlayer` calls in `RunningScreen.js`.

**Decision rationale.** Pure JS, no rebuild. Should keep session continuously active across beeps, satisfying iOS background mode.

**Outcome.** Background still broken. User: *"still doesn't work for background or lockscreen."*

**What this ruled out.** An inactive session between beeps was not the (only) cause.

### Stage 10: Architectural realization — silent loop hack

**Situation.** All flags now correct (`playsInSilentMode`, `shouldPlayInBackground`, `keepAudioSessionActive`, `UIBackgroundModes:audio` in `Info.plist`). Still fails.

**Assessment.** iOS background mode requires actively flowing audio samples, not just an active session. Between beeps — even with active session — no samples flow, iOS suspends the app, JS thread goes idle. This is a known iOS issue. Standard fix used by Tabata Pro / HIIT / sleep timer apps: loop a silent audio file in background to keep audio production continuous.

**Change made (proposed).** Add `silence.wav` generator to `scripts/generate-sounds.js`, create silence player with `loop=true`, `volume=0`, start on workout begin, stop on unmount.

**Decision rationale.** Matches what every interval timer on iOS does. No way around it without abusing PushKit/VoIP background entitlements.

**Outcome.** User interrupted the edit — *"wait i was running the app when the beeps were 2 seconds apart and it stopped running in the background"*. This data point confirms the architectural diagnosis: even tiny 2-second gaps trigger suspension. Not a "long gap" issue.

### Stage 11: Verification — Info.plist sanity check

**Change made.** `grep -A2 "UIBackgroundModes" ios/randoro/Info.plist` → confirmed `<string>audio</string>` is set correctly.

**Outcome.** Background mode IS in the native Info.plist. Not a config gap. Confirms the issue is the architectural one above.

---

## End of Session 1 — State Summary

### What's working

- `AVAudioSession.setCategory(.playback, options: [])` set natively in `AppDelegate.swift:17-30` at launch via `plugins/withAudioSession.js`
- `setAudioModeAsync` in `RunningScreen.js:17-22` with `shouldPlayInBackground: true`, `interruptionMode: 'doNotMix'`
- All `useAudioPlayer` calls have `{ keepAudioSessionActive: true }` (`RunningScreen.js:54-58`)
- `UIBackgroundModes:audio` confirmed in `ios/randoro/Info.plist`
- Foreground audio works on phone speaker, Q45 headphones
- Speaker (A3102) works when an anchor app (Spotify, Apple Music) is actively playing through it — Randoro mixes in successfully

### What's broken

- **Background / lockscreen audio.** Confirmed at 2 s beep intervals — any moment without flowing audio samples → iOS suspends app → setInterval stops → no further beeps.
- **Anker A3102 alone.** Without an anchor app, Randoro can't open the A2DP route to the speaker by itself. Q45 headphones don't have this constraint.

### Most promising next directions

**Silent-loop background hack** (high confidence, will likely fix #1 and possibly #2 as a side effect):

- Generate `silence.wav` (1 s of zero-amplitude PCM, ~88 KB) via `scripts/generate-sounds.js`
- Create a `silencePlayer` in `RunningScreen.js` with `loop = true`, `volume = 0`
- Start on workout begin (`handleStartPause`), stop on unmount
- Continuous audio production satisfies iOS background mode
- Bonus: continuous audio may also "wake" the A2DP route on the A3102, fixing #2 incidentally

**If silent loop fixes background but not the A3102:**

1. Try `MPNowPlayingInfoCenter` registration — elevates session to "primary" status
2. Try `setPreferredOutput` to force route to the BT speaker
3. Try a brief audible-but-quiet ping at workout start to "claim" the A2DP route, then go silent

### Things ruled out for good

- Not a missing native call (Stage 2)
- Not the speaker being unable to receive iOS audio (Stage 4: Apple Music works)
- Not `.allowBluetoothA2DP` being missing (redundant for `.playback`; Stage 5)
- Not `shouldPlayInBackground=false` alone causing background failure (Stage 8: still fails after fixing)
- Not `keepAudioSessionActive=false` alone causing background failure (Stage 9: still fails after fixing)
- Not "long gaps between beeps" (Stage 10: 2 s gaps also fail)
- Not a missing `UIBackgroundModes` entry (Stage 11: confirmed present)

### Key technical takeaways

- `.allowBluetoothA2DP` is redundant for `.playback` — A2DP routes by default
- `.mixWithOthers` makes iOS treat session as non-primary; some BT devices won't auto-route to non-primary sessions (A3102 is one of them)
- `setAudioModeAsync` always rebuilds the entire category — partial calls aren't possible, but `'doNotMix'` produces empty options
- expo-audio defaults (`keepAudioSessionActive: false`, `shouldPlayInBackground: false`) actively fight against background interval timers
- iOS `UIBackgroundModes:audio` requires flowing samples, not just an active session — hence the universal silent-loop hack across timer apps

---

## Session 2 — Silent-loop hack (2026-05-06 to 2026-05-07)

Picked up the silent-loop hack from "Most promising next directions" above. The plan was: looped `silence.wav` at volume 0, started on workout begin, stopped on unmount. It did not work as written — discovering why exposed two new findings (expo-audio's loop has gaps, and iOS inspects PCM content). Bug 2 is now fixed for phone speaker. Bug 1 (A3102 alone) is unchanged.

### Stage 12: Initial silent-loop implementation

**Situation.** Plan from end of Session 1 — generate `silence.wav`, create `silencePlayer` with `loop=true` and `volume=0`, drive via `isRunning` state.

**Change made.**

- `scripts/generate-sounds.js` — added silence entry to files map: `{ freq: 0, duration: 1.0 }`. Math: `sin(0) = 0` for every sample, so existing `buildWav` produces 1 s of zero-amplitude PCM (~88 KB) with no new helpers.
- `src/screens/RunningScreen.js` — `silencePlayer = useAudioPlayer(silence.wav, { keepAudioSessionActive: true })`. Set `loop=true` and `volume=0` in a useEffect. Started on `isRunning=true`, paused via cleanup.
- Generated `silence.wav`.

**Decision rationale.** Smallest possible change. Reuse existing `buildWav`. Drive playback off existing `isRunning` state — no new state. Both bugs might fix together if continuous audio claims the A2DP route incidentally.

**Outcome.** Test failed. Cold A3102 alone — still silent. Spotify-anchor case — first beep fires, then audio drops out. Silent-loop hack as initially configured did not solve either bug.

### Stage 13: Diagnostic — verify the loop is even running

**Situation.** With volume 0 and zero-PCM, can't tell whether `silencePlayer.play()` is firing. Need to make the silent stream audible to confirm.

**Change made.**

- `buildWav` extended with optional `amplitude` and `fade` params (defaults preserve beep behavior)
- `silence.wav` regenerated as 1 s of 110 Hz sine (amplitude 0.3, no fade) — 110 cycles × 1 s = integer cycles, no discontinuity at loop boundary
- `silencePlayer.volume` bumped to 0.5
- Patched cleanup with try/catch: `NativeSharedObjectNotFoundException` was thrown when `silencePlayer.pause()` ran on a player whose native counterpart had been reaped (Fast Refresh / iOS reaping after extended background)

**Decision rationale.** One variable at a time. Audible drone surfaces whether the loop is firing AND lets us hear how it's behaving over time.

**Outcome.** User reported *"buzz for ~1 s, stops for ~1/10 s, repeats."* expo-audio's `loop=true` is **NOT** gapless — there's a ~100 ms restart latency between iterations. Smoking gun for why "continuous samples" was never actually continuous.

User also reported: *"buzzing persisted 1-2 s after lock screen, then stopped all audio."* The 1-2 s window matches a single drone iteration playing through the lock event before the loop boundary hits and iOS suspends.

**What this ruled out.** `loop=true` with expo-audio cannot deliver gapless audio.

### Stage 14: Test the loop-gap hypothesis

**Situation.** If the 100 ms loop gap is what kills background mode, a single non-looped long file should keep iOS happy.

**Change made.**

- `silence.wav` regenerated as 60 s of 110 Hz drone at amplitude 0.3 (still audible)
- `silencePlayer.loop = false`

**Decision rationale.** Disambiguate "iOS suspends regardless" from "iOS suspends because of loop gap." Single play has zero loop boundaries.

**Outcome.** Drone played continuously through both backgrounding and lock screen for the full 60 s, beeps fired throughout. **Hypothesis confirmed**: expo-audio's loop gap was the killer for Bug 2. Silent-loop hack works without the loop.

### Stage 15: Production attempt — long single-play true silence

**Situation.** Loop-gap fixed in principle. Need a silent (volume 0) production version covering plausible workout durations.

**Change made.**

- Refactored `scripts/generate-sounds.js`: extracted `writeWavHeader`, added separate `buildSilenceWav` generating zero-PCM at 8 kHz mono. Reverted Stage 13's `amplitude`/`fade` params on `buildWav` since no longer needed.
- `silence.wav`: 60 min × 8 kHz × 16-bit × mono = 57.6 MB true silence (zero-filled buffer + WAV header)
- `silencePlayer.volume = 0`
- `silencePlayer.loop = false` (kept from Stage 14)
- `silencePlayer.seekTo(0)` on each `play()` → fresh 60-min runway on each pause/resume

**Decision rationale.** 60 min covers typical boxing classes. 8 kHz cuts file size 5x vs 44.1 kHz — silence quality is irrelevant. `seekTo(0)` handles the pause/resume edge case.

**Outcome.** Major regression. User test results:

| Scenario | Result |
|---|---|
| Cold A3102 alone | no audio (Bug 1 unchanged) |
| Spotify-anchor case | audio plays for exactly 5 s, then a "speaker disconnect tone" sounds (BT speaker's standard timeout chime), then dies |
| Phone speaker backgrounded | dies (regressed from Stage 14 where the audible drone worked) |
| Cold open then start Spotify externally during workout | Randoro audio works much longer |

The 5 s cutoff is consistent and the new key data point.

### Stage 16: New hypothesis — iOS inspects PCM content

**Situation.** Stage 14 (audible drone) worked in background. Stage 15 (zero-PCM, volume 0) didn't. Two variables changed at once — PCM content and volume. The 5 s cutoff in Stage 15's Spotify case suggests an iOS heuristic firing.

**Hypothesis.** iOS doesn't just check session configuration. It inspects the audio stream's actual sample content after a ~5 s grace period. Zero-PCM is rejected as "not really playing audio," causing iOS to release the A2DP route and suspend the app. The 5 s timer matches the Spotify-anchor cutoff exactly.

**Explains all four Stage 15 scenarios.**

- Cold + A3102: zero-PCM never claims the route in the first place
- Spotify anchor → 5 s → die: route piggybacks on Spotify's pause-tail, then iOS's content check fires at 5 s, sees zeros, releases
- Spotify started externally during workout: real audio in the shared session keeps iOS satisfied indefinitely
- Background dies: zero-PCM stream not recognized as "playing audio"

If true, the fix is: real PCM samples (so iOS sees audio) + volume 0 (so user hears nothing).

### Stage 17: Production attempt v2 — non-zero PCM + volume 0

**Situation.** Need iOS to see real samples while keeping output silent.

**Change made.**

- `silence.wav`: 60 min of 110 Hz sine at amplitude 0.05 (low PCM content) at 8 kHz mono — same 57.6 MB file size
- `silencePlayer.volume = 0` (still silent to user)
- `silencePlayer.loop = false` (still single play)

**Decision rationale.** If iOS inspects PCM pre-volume (most likely), this satisfies the content check while remaining silent at the output. Low amplitude (0.05) means even leakage at high volume would be quiet. Falls back to `volume = 0.001` if iOS turns out to check post-volume.

**Outcome.** Mixed — Bug 2 confirmed FIXED on phone speaker; Bug 1 (A3102) still failing.

User test results:

| Scenario | Result |
|---|---|
| Phone speaker — foreground | ✓ |
| Phone speaker — with Spotify (Spotify pauses when Randoro plays, expected) | ✓ |
| Phone speaker — background | ✓ |
| Phone speaker — lock screen | ✓ |
| A3102, cold open without Spotify | ✗ no audio |
| A3102, Spotify playing on app open → press Start (Spotify pauses) | ✗ no audio |
| A3102, Spotify playing on app open → resume Spotify in Randoro app → press Start | ✗ Randoro plays a few seconds, then cuts out (audible audio drop on speaker as iOS releases route) |

Confirms Stage 16's hypothesis (PCM content matters; non-zero PCM with volume=0 keeps iOS satisfied for the phone-speaker route). Does NOT solve A3102's separate "won't accept Randoro alone" bug.

**Commit.** `ca6430d` on `debug/bluetooth-audio-fix`.

### Stage 18: silencePlayer minimal non-zero volume

**Situation.** Stage 17 set `silencePlayer.volume = 0`. Phone speaker worked in all scenarios but A3102 was still broken — silent on cold open, dropped after a few seconds with a Spotify anchor. Stage 14, which had `volume = 0.5` with an audible drone, had worked on A3102. The volume difference between Stage 14 and Stage 17 hadn't been isolated as its own variable.

**Change made.** `silencePlayer.volume = 0` → `silencePlayer.volume = 0.05` in `src/screens/RunningScreen.js`. PCM amplitude unchanged at 0.05.

**Decision rationale.** Bluetooth routing in background and on lock screen needs constant non-zero volume. 0.05 is below the threshold of perception in a normal room.

**Outcome.** Works in every tested scenario:

- Phone speaker — foreground, background, lock screen ✓
- A3102 cold open alone ✓
- A3102 with Spotify anchor ✓
- Drone inaudible in all cases

Bug 1 (A3102 cold-route) and Bug 2 (background) both resolved.

**Commit.** `e87bd1c` on `debug/bluetooth-audio-fix`.

### Stage 19: setAudioModeAsync → mixWithOthers

**Situation.** `doNotMix` made Randoro pause Spotify on workout start. Want them to mix.

**Change made.** `interruptionMode: 'doNotMix'` → `'mixWithOthers'` in `setAudioModeAsync` at the top of `src/screens/RunningScreen.js`.

**Decision rationale.** Maps directly to AVAudioSession's `.mixWithOthers` option.

**Outcome.** Partial.

- After app open, Randoro beeps mix with Spotify without pausing it ✓
- App still pauses Spotify on initial open ✗

**Commit.** ab799bff

### Stage 20: AppDelegate setCategory options → [.mixWithOthers]

**Situation.** Stage 19 set the JS-level interruption mode to `mixWithOthers`, but the native plugin still injected `options: []` into AppDelegate. The AppDelegate's `setCategory` + `setActive(true)` runs at app launch before any JS, so even with Stage 19 in place, the initial session activation interrupted Spotify.

**Change made.** `plugins/withAudioSession.js`: `options: []` → `options: [.mixWithOthers]`. Re-ran `npx expo prebuild --platform ios` to regenerate `AppDelegate.swift`, then `npx expo run:ios --device`.

**Decision rationale.** Match both audio session layers on the same option so the session is configured for mixing from app launch onwards.

**Outcome.** Partial.

- `ios/randoro/AppDelegate.swift` verified containing `options: [.mixWithOthers]` ✓
- Spotify still pauses on initial app open ✗

Root cause not yet isolated; possibly related to `setAudioModeAsync` at the top of `RunningScreen.js`.

**Commit.** 9514547d

### Stage 21: setAudioModeAsync interruptionMode mixWithOthers → duckOthers

**Situation.** While trying to fix the initial open, I explored other interruption options.

**Change made.** `setAudioModeAsync` interruption mode `'mixWithOthers'` → `'duckOthers'` in `src/screens/RunningScreen.js`. duckOthers lowers Spotify's volume while Randoro plays so audio cues cut through clearly.

**Outcome.** Doesn't solve pause on initial open. But nicer audio experience

**Commit.** (to fill after commit)
