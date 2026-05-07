---
name: Collaboration Feedback
description: How to work with Diarmuid effectively — what to do and avoid
type: feedback
originSessionId: 6db02655-3401-4670-a275-04d82ebca659
---
**Always explain changes before making them, including source references.**
Why: User rejected edits without explanation and went to verify docs himself. He needs to understand the why before accepting a change.
How to apply: Before every code change, state what it does and why. Offer a doc reference he can check.

**Don't recommend deprecated libraries without verifying first.**
Why: Recommended expo-av which turned out to be deprecated. User found this himself by checking docs.
How to apply: Before recommending a library switch, verify it's current. Check the user's installed version and the actual type definitions.

**Push back on analysis paralysis — force a decision.**
Why: User tends to seek external validation for decisions he should own. Asking "what do YOU think?" and refusing to decide for him builds his judgment.
How to apply: When user is going in circles, name it directly and force a call.

**Commit after each logical change, not in batches.**
Why: User ended up with too many unrelated changes in one commit.
How to apply: Remind user to commit after each discrete change. Flag when working directly on main.

**Always use dev branch, merge to main only for new versions.**
Why: User requested this workflow explicitly.
How to apply: Remind at start of sessions if on main. Flag before any significant change.

**Don't say "option 3 doesn't exist" without fully thinking it through.**
Why: Told user there was no way to have dev build and TestFlight on same phone. He proved this wrong — npx expo run:ios installs a separate app with a different identifier from TestFlight.
How to apply: Think through all options before ruling them out.

**Deprecation notices should be flagged — don't use deprecated commands.**
Why: User caught that `pod install` directly is deprecated in React Native. Should use `npx expo run:ios` instead.
How to apply: Watch for deprecation warnings in command output and update recommendations accordingly.

**Experimentation stays out of commits — document journeys in memory instead.**
Why: User explicitly stated "committed code is intended for code that has been tested and works. all of this is experimentation and can be documented separately." Diagnostic tweaks, intermediate hypotheses, and dead-end attempts pollute git history and make `git log` unreadable in 6 months.
How to apply: During investigations, hold edits uncommitted on dev. When a working config is found, commit ONE clean change (no DIAGNOSTIC comments, no defensive code added only for fast-refresh debugging unless legitimately needed). Capture the journey as stages in `memory/randoro_bluetooth_audio_journey_log.md` and the takeaways in the relevant `project_*.md` memory file. Use `git stash` for partial work that's not ready to commit.
