Randoro Bluetooth Audio Journey Log
A chronological record of every distinct phase in solving (or attempting to solve) two problems: (1) audio not routing to the Anker Soundcore A3102 Bluetooth speaker, and (2) background/lockscreen audio failure.

--- Stage 1: Initial brief ---
Situation: Randoro audio does not route to Anker Soundcore A3102 speaker. Works on iPhone earpiece and Anker Q45 headphones. Stack: Expo SDK 54, expo-audio 1.1.1. expo-audio doesn't expose .allowBluetoothA2DP.

Assessment: Need to set AVAudioSession category natively. User came in with a recommendation from a prior chat to write a full native module (Swift + .m bridge + config plugin + JS hook).

Change made: None yet — scouting only.

Decision rationale: Discovered /ios is gitignored, so any change must survive expo prebuild. Chose withAppDelegate config plugin (inject straight into AppDelegate.swift) over a full NativeModule + JS bridge. Simpler, fewer files, runs at launch before any RN code can interfere.

Outcome: Plan committed.

--- Stage 2: First implementation — mixWithOthers + allowBluetoothA2DP ---
Situation: Need native AVAudioSession.setCategory to run before any expo-audio code touches the session.

Change made:

Created plugins/withAudioSession.js — injects setCategory(.playback, mode: .default, options: [.mixWithOthers, .allowBluetoothA2DP]) and setActive(true) into didFinishLaunchingWithOptions
Registered plugin in app.json
Removed setAudioModeAsync call from RunningScreen.js (was setting category without .allowBluetoothA2DP and would clobber ours)
Fixed duplicate "audio" in UIBackgroundModes
Ran npx expo prebuild --platform ios (no --clean to preserve ENABLE_USER_SCRIPT_SANDBOXING=NO)
Verified Swift compiles via xcodebuild
Decision rationale: AppDelegate runs once at launch, before any expo-audio module loads. Plugin uses a marker comment for idempotent injection. Avoiding --clean preserves manual sandbox setting.

Outcome: Code compiled, installed on device via expo run:ios --device. Test failed — same behavior as before, no audio through speaker. What this ruled out: not a missing native call, not a build/install issue.

--- Stage 3: Diagnostic phase — localize the bug ---
Situation: Native config in place, speaker still silent. Source of failure unknown.

Change made: None — diagnostic questions only.

Decision rationale: Don't add more code until we know if the bug is even in our code path. Started narrowing with: cold launch confirmed? Spotify in the picture? AirPods test?

Outcome: User reported clean test (deleted app, fresh expo run:ios --device). Headphones (Anker Q45) work, speaker (Anker A3102) doesn't.

--- Stage 4: Apple Music test — speaker works for some apps, not Randoro ---
Situation: Need to know whether the speaker can receive iOS audio at all.

Change made: None — asked user to play Apple Music with only the speaker connected.

Decision rationale: If Apple Music routes there, the bug is in our session config. If not, the speaker is an iOS-level pairing issue.

Outcome: User reported a full test matrix:

Apple Music → A3102 speaker ✓
Randoro alone → A3102 speaker ✗
Music + Randoro mixed on speaker → only music plays, Randoro silent
Randoro → phone speaker ✓
Randoro → Q45 headphones ✓
Conclusion: The route to the speaker IS available. iOS is making a per-session routing decision and choosing not to send Randoro's audio there.

--- Stage 5: New hypothesis — .mixWithOthers blocks A2DP routing ---
Situation: iOS routes Apple Music to speaker but not Randoro, even concurrently. Difference: Apple Music's session likely uses .playback without .mixWithOthers; ours has it.

Assessment: .mixWithOthers may signal "non-primary session" to iOS, and the A3102 specifically may not accept non-primary audio. Q45 headphones don't show this quirk.

Change made:

Updated plugins/withAudioSession.js: options: [] (dropped both .mixWithOthers and .allowBluetoothA2DP)
Switched plugin from single marker to BEGIN/END markers so re-runs replace the block instead of skipping
Added NSLog diagnostic printing currentRoute.outputs at launch
Manually cleaned up an orphan block left behind by the old single-marker style
Re-ran expo prebuild
Decision rationale: Apple docs confirm .allowBluetoothA2DP is redundant for .playback (A2DP routes by default). Removing .mixWithOthers is a cheap, single-line test of the hypothesis. Begin/end markers make the plugin idempotent against future body changes.

Outcome: Major progress + new regression — see Stage 6.

--- Stage 6: Major progress + background regression discovered ---
Situation: User ran a fresh test matrix on device. Results:

Test 5 (speaker, with Spotify): Spotify pauses on Randoro launch → start timer → Spotify resumes → both play through speaker ✓ BIG WIN
Test 6 (speaker): pause Spotify mid-workout → Randoro audio stops on speaker ✗
Test 7 (speaker, no anchor): Randoro alone → silent ✗
Test 9 (headphones): app backgrounded → audio stops ✗ REGRESSION
Test 10 (phone speaker): app backgrounded → audio stops ✗ REGRESSION
Assessment: Two distinct issues:

Speaker piggybacking only — A3102 accepts Randoro only while another app is actively pumping audio through it; alone, route fails to open
Background audio broken — caused by removing setAudioModeAsync in Stage 2; lost expo-audio's shouldPlayInBackground internal flag
Change made: None yet — investigation phase.

Decision rationale: Need to fix the regression first (it's clearly self-inflicted) before tackling the harder A3102 problem.

Outcome: Investigation moved to expo-audio source.

--- Stage 7: Investigation — expo-audio internals ---
Situation: Need to understand why removing setAudioModeAsync broke background.

Change made: Read node_modules/expo-audio/ios/AudioModule.swift.

Findings:

Line 67: OnAppEntersBackground { if !shouldPlayInBackground { pauseAllPlayers() } } — confirms expo-audio actively pauses players on backgrounding when flag is false
shouldPlayInBackground defaults to false, only flipped via setAudioModeAsync
setAudioModeAsync ALWAYS rebuilds the category — but with interruptionMode: 'doNotMix' it produces options: [], identical to our native config
Line 75: useAudioPlayer default keepAudioSessionActive: false — important for next stage
Decision rationale: Found a way to re-add setAudioModeAsync without re-introducing .mixWithOthers.

Outcome: Path to fix identified.

--- Stage 8: Re-add setAudioModeAsync with safe params ---
Change made: Updated RunningScreen.js:


setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  allowsRecording: false,
  interruptionMode: 'doNotMix',
});
Decision rationale: 'doNotMix' produces empty options — same as native config, no speaker regression. shouldPlayInBackground: true flips the expo-audio internal flag.

Outcome: Background still broken. User: "still doesn't work in the background or when screen is locked." What this ruled out: the shouldPlayInBackground flag alone is necessary but not sufficient.

--- Stage 9: keepAudioSessionActive theory ---
Situation: Background still failing despite correct flag.

Assessment: Found in expo-audio source: after every beep finishes, onPlaybackComplete calls deactivateSession() → setActive(false) — UNLESS player was constructed with keepAudioSessionActive: true. Default is false. So between beeps, session deactivates → iOS suspends app under background mode → next setInterval doesn't fire.

Change made: Added { keepAudioSessionActive: true } to all 4 useAudioPlayer calls in RunningScreen.js.

Decision rationale: Pure JS, no rebuild. Should keep session continuously active across beeps, satisfying iOS background mode.

Outcome: Background still broken. User: "still doesn't work for background or lockscreen." What this ruled out: an inactive session between beeps was not the (only) cause.

--- Stage 10: Architectural realization — silent loop hack ---
Situation: All flags now correct (playsInSilentMode, shouldPlayInBackground, keepAudioSessionActive, UIBackgroundModes:audio in Info.plist). Still fails.

Assessment: iOS background mode requires actively flowing audio samples, not just an active session. Between beeps — even with active session — no samples flow, iOS suspends the app, JS thread goes idle. This is a known iOS issue. Standard fix used by Tabata Pro / HIIT / sleep timer apps: loop a silent audio file in background to keep audio production continuous.

Change made (proposed): Add silence.wav generator to scripts/generate-sounds.js, create silence player with loop=true, volume=0, start on workout begin, stop on unmount.

Decision rationale: Matches what every interval timer on iOS does. No way around it without abusing PushKit/VoIP background entitlements.

Outcome: User interrupted the edit — "wait i was running the app when the beeps were 2 seconds apart and it stopped running in the background". This data point confirms the architectural diagnosis: even tiny 2-second gaps trigger suspension. Not a "long gap" issue.

--- Stage 11 (verification): Info.plist sanity check ---
Change made: grep -A2 "UIBackgroundModes" ios/randoro/Info.plist → confirmed <string>audio</string> is set correctly.

Outcome: Background mode IS in the native Info.plist. Not a config gap. Confirms the issue is the architectural one above.

Current State
What's working
AVAudioSession.setCategory(.playback, options: []) set natively in AppDelegate.swift:17-30 at launch via plugins/withAudioSession.js
setAudioModeAsync in RunningScreen.js:17-22 with shouldPlayInBackground: true, interruptionMode: 'doNotMix'
All useAudioPlayer calls have { keepAudioSessionActive: true } (RunningScreen.js:54-58)
UIBackgroundModes:audio confirmed in ios/randoro/Info.plist
Foreground audio works on phone speaker, Q45 headphones
Speaker (A3102) works when an anchor app (Spotify, Apple Music) is actively playing through it — Randoro mixes in successfully
What's broken
Background / lockscreen audio. Confirmed at 2s beep intervals — any moment without flowing audio samples → iOS suspends app → setInterval stops → no further beeps.
Anker A3102 alone. Without an anchor app, Randoro can't open the A2DP route to the speaker by itself. Q45 headphones don't have this constraint.
Most promising next directions
Silent-loop background hack (high confidence, will likely fix #1 and possibly #2 as a side effect).

Generate silence.wav (1 s of zero-amplitude PCM, ~88 KB) via scripts/generate-sounds.js
Create a silencePlayer in RunningScreen.js with loop = true, volume = 0
Start on workout begin (handleStartPause), stop on unmount
Continuous audio production satisfies iOS background mode
Bonus: continuous audio may also "wake" the A2DP route on the A3102, fixing #2 incidentally
If silent loop fixes background but not the A3102:

Try MPNowPlayingInfoCenter registration — elevates session to "primary" status
Try setPreferredOutput to force route to the BT speaker
Try a brief audible-but-quiet ping at workout start to "claim" the A2DP route, then go silent
Things ruled out for good
It's not a missing native call (Stage 2)
It's not the speaker being unable to receive iOS audio (Stage 4: Apple Music works)
It's not .allowBluetoothA2DP being missing (redundant for .playback; Stage 5)
It's not shouldPlayInBackground=false alone causing background failure (Stage 8: still fails after fixing)
It's not keepAudioSessionActive=false alone causing background failure (Stage 9: still fails after fixing)
It's not "long gaps between beeps" (Stage 10: 2s gaps also fail)
It's not a missing UIBackgroundModes entry (Stage 11: confirmed present)
Key technical takeaways
.allowBluetoothA2DP is redundant for .playback — A2DP routes by default
.mixWithOthers makes iOS treat session as non-primary; some BT devices won't auto-route to non-primary sessions (A3102 is one of them)
setAudioModeAsync always rebuilds the entire category — partial calls aren't possible, but 'doNotMix' produces empty options
expo-audio defaults (keepAudioSessionActive: false, shouldPlayInBackground: false) actively fight against background interval timers
iOS UIBackgroundModes:audio requires flowing samples, not just an active session — hence the universal silent-loop hack across timer apps