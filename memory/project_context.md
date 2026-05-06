---
name: Project Context
description: What randoro is, current state, and active issues
type: project
originSessionId: 6db02655-3401-4670-a275-04d82ebca659
---
Randoro is a random interval timer for shadow boxing. It plays random audio cues (beeps) during work rounds to keep training unpredictable. Used by Diarmuid to coach beginner boxing classes — music plays through a Bluetooth speaker while the app fires beeps over the top.

**Current state (as of May 2026):**
- TestFlight build 1.0.0 (build 2) is live; an updated build with audio fixes is queued behind two bugs below
- Dev branch has DurationPicker UI changes + native AudioSession plugin ahead of main
- Apple Developer account enrolled, TestFlight set up

**Active bugs (both blockers):**
- **Anker Soundcore A3102 speaker:** Randoro audio doesn't route there alone. Routes correctly when an anchor app (Spotify) is actively playing through the speaker. Anker Q45 headphones work fine. Investigation found `.mixWithOthers` was a major contributor — partial fix in place. See [project_audio_session.md](project_audio_session.md).
- **Background/lockscreen audio:** App suspends when backgrounded; beeps stop. Confirmed at 2s intervals — architectural iOS issue, not a config gap. Standard fix is silent-audio loop hack (not yet implemented). See [project_audio_session.md](project_audio_session.md).

**Queued work:**
- Background audio fix via silent-loop hack (blocker, in progress)
- A3102 speaker without anchor (blocker, may be incidentally fixed by silent loop)
- Rounds input scroll wheel (currently TextInput)
- Visual cleanup on setup screen (borders/shadows feel heavy)
- Landing/home screen before setup
- Info (?) tooltip feature for settings labels