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

**Treat open-ended requests as starting points — ask clarifying questions before executing.**
Why: User often gives high-level requests ("write a README", "fix the audio bug", "rewrite this in my voice") that benefit from refinement. Jumping to action with assumptions wastes effort if the assumption is wrong, and the user has context worth surfacing before code changes happen.
How to apply: When the request has ambiguous scope, audience, or goals, ask 1-3 specific clarifying questions first — often the cleanest form is "here are 2-3 options A/B/C with trade-offs; which do you want?" rather than abstract questions. For clearly-bounded asks ("delete file X", "add Y to the list"), just execute. The test: would a different assumption about scope or intent produce a meaningfully different output? If yes, ask. If no, do.

**Debugging investigations: debug branch, commit-per-stage, squash-merge with audit.**
Why: User got this approach from a principal SWE on 2026-05-08, superseding the earlier "experimentation out of commits" rule. Commit-per-stage gives two-way traceability between the markdown journey log (stage #) and git (commit hash) — any historical state can be reproduced. The pre-squash audit exists because the user has explicitly said they cannot always detect when Claude adds extra code beyond the fix (defensive try/catch, opportunistic refactors, leftover diagnostic helpers, abstractions added during exploration) — and they care more about a clean `dev` than convenience while iterating.
How to apply:
1. **Branch off dev.** `git checkout -b debug/<short-name>`.
2. **Per-stage commit.** Each stage in the journey log = one commit. Message format: `"stage NN: <short title> — see notes #NN"`. After committing, paste the commit hash back into the stage under a `**Commit.**` label so notes ↔ git is bidirectional.
3. **Minimal diffs while iterating.** Do not refactor, extract helpers, or introduce abstractions beyond what the current test requires. Diagnostic code (DIAGNOSTIC comments, audible drones, console.log, temporary scripts) must be reverted before the final commit on the branch. Defensive try/catch added only for Fast Refresh or other dev-only conditions does NOT belong in production code.
4. **Pre-squash audit.** Before merging to dev, run `git diff dev...debug/<name>` as a unified diff and walk through every changed line with the user. Each addition must justify itself as required for the fix. Be skeptical of: leftover diagnostic code, dev-only defensive code, opportunistic refactors, abstractions added during exploration. Anything not strictly required gets removed before the squash.
5. **Squash-merge to dev.** One clean commit summarizing the fix. Do NOT delete the debug branch — it's the canonical record alongside the markdown journey log.
