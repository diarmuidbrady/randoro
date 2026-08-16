---
name: Project Context
description: What randoro is, current state, and active issues
type: project
originSessionId: 6db02655-3401-4670-a275-04d82ebca659
modified: 2026-08-16T17:10:25.306Z
---
Randoro is a random interval timer for shadow boxing. It plays random audio cues (beeps) during work rounds to keep training unpredictable. Used by Diarmuid to coach beginner boxing classes — music plays through a Bluetooth speaker while the app fires beeps over the top.

**Current state (as of Aug 2026):**
- Presented the app publicly; it went well. Now iterating on post-feedback polish toward App Store submission.
- Background audio (silence-loop hack), scroll-wheel duration/rounds pickers, home/landing screen, and tooltips are all built and shipped in the code (the May 2026 "queued work" list is done).
- Recent completed work: Dynamic Type across Setup/Home/Running screens; louder harmonic beeps with true-peak normalisation; phase-jump-while-paused fix; ghost beep fix (see [[project_ghost_beep_fix]]).

**Product signal (16 Aug 2026, Riain O'Donovan — intermediate Irish amateur boxer):**
- Core app is validated. "Intuitive, no guide needed." "Likes it as is, doesn't need much more."
- Simplicity is the north star, stated twice by the same user: keep the app simple, a user should start a workout in a few clicks. Any added depth must stay optional and off the common path.
- Direction: focus on polish and App Store release. Feature ideas are logged in the repo's TODO.md; the needs behind them in USER_NEEDS.md. Treat these as a considered backlog, not a build queue.

**Repo docs (top level):** README.md (how to run + navigate the repo), TODO.md (distilled feature ideas + release tasks), USER_NEEDS.md (user needs, kept separate from features). The repo's `memory/` folder is a published mirror of this Claude memory, synced when things change.

**Audio history (resolved enough to ship):** earlier blockers were Bluetooth routing (Anker A3102 needed an anchor app) and background/lockscreen audio suspension. Addressed via the silence-loop + AudioSession plugin. See [[project_audio_session]].
