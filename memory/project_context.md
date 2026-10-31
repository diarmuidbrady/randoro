---
name: Project Context
description: What randoro is, who it's for, current state and product direction
type: project
---
Randoro is a random interval timer for shadow boxing. It plays random audio cues (beeps) during work rounds to keep training unpredictable. Used by Diarmuid to coach beginner boxing classes — music plays through a Bluetooth speaker while the app fires beeps over the top.

**Current state (25 Oct 2026):**
- iOS has been live on the App Store since September 2026. Android is in beta testing on Google Play.
- 1.1.0 (Android versionCode 4) is being prepared for both. It brings the Preset / Manual / Simple workout styles, the How it works tutorial, a 10 s warning and 3-2-1 countdown before each round, a beep count during rounds, the heartbeat trace from the app icon on the Home screen, a dark splash screen, and an Android icon that's no longer cropped.
- Earlier work: presented publicly at Demos Anon on 29 May 2026, where it went well. Since then: Dynamic Type across all screens, louder harmonic beeps, the ghost beep fix ([[project_ghost_beep_fix]]), background beeps and Bluetooth fixes on Android, and fewer permissions.

**Product signal (16 Aug 2026, an intermediate Irish amateur boxer):**
- Core app is validated. "Intuitive, no guide needed." "Likes it as is, doesn't need much more."
- Simplicity is the north star, stated twice by the same user: keep the app simple, a user should start a workout in a few clicks. Any added depth must stay optional and off the common path.
- Direction: focus on polish and the Android release. Feature ideas are logged in the repo's TODO.md; the needs behind them in USER_NEEDS.md. Treat these as a considered backlog, not a build queue.

**Repo docs (top level):** README.md (how to run + navigate the repo), CHANGELOG.md (what shipped in each release), TODO.md (distilled feature ideas + release tasks), USER_NEEDS.md (user needs, kept separate from features), `store/` (App Store and Play listing text). This `memory/` folder holds engineering notes: current summaries (this file, [[project_technical]], [[project_audio_session]]) and dated records of past problems.

**Audio history:** the earlier blockers were Bluetooth routing (the Anker A3102 needed an anchor app) and background/lock-screen audio being suspended. The near-silent drone fixed both. The AudioSession plugin was later found redundant and removed, which also stopped Spotify pausing when the app opens. See [[project_audio_session]] and [[project_audio_journey_log]].
