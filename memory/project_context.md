---
name: Project Context
description: What randoro is, who it's for, current state and product direction
type: project
originSessionId: 6db02655-3401-4670-a275-04d82ebca659
modified: 2026-08-16T17:10:25.306Z
---
Randoro is a random interval timer for shadow boxing. It plays random audio cues (beeps) during work rounds to keep training unpredictable. Used by Diarmuid to coach beginner boxing classes — music plays through a Bluetooth speaker while the app fires beeps over the top.

**Current state (21 Oct 2026):**
- iOS has been live on the App Store since September 2026.
- Android version 3 (versionCode 3) is being prepared for Play Console. It brings background beeps, Bluetooth audio fixes, the JS scroll-wheel pickers, a native-driven home animation with a heartbeat sound, and fewer permissions.
- Earlier work: presented publicly in August, where it went well. Since then: Dynamic Type across all screens, louder harmonic beeps and the ghost beep fix ([[project_ghost_beep_fix]]).

**Product signal (16 Aug 2026, Riain O'Donovan — intermediate Irish amateur boxer):**
- Core app is validated. "Intuitive, no guide needed." "Likes it as is, doesn't need much more."
- Simplicity is the north star, stated twice by the same user: keep the app simple, a user should start a workout in a few clicks. Any added depth must stay optional and off the common path.
- Direction: focus on polish and the Android release. Feature ideas are logged in the repo's TODO.md; the needs behind them in USER_NEEDS.md. Treat these as a considered backlog, not a build queue.

**Repo docs (top level):** README.md (how to run + navigate the repo), TODO.md (distilled feature ideas + release tasks), USER_NEEDS.md (user needs, kept separate from features). This `memory/` folder holds engineering notes: current summaries (this file, [[project_technical]], [[project_audio_session]]) and dated records of past problems.

**Audio history:** the earlier blockers were Bluetooth routing (the Anker A3102 needed an anchor app) and background/lock-screen audio being suspended. The near-silent drone fixed both. The AudioSession plugin was later found redundant and removed, which also stopped Spotify pausing when the app opens. See [[project_audio_session]] and [[project_audio_journey_log]].
