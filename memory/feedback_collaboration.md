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

**Don't add the "Co-Authored-By: Claude" line to commit messages.**
Why: User explicitly rejected it when committing.
How to apply: Omit the co-author trailer from all commit messages for this user unless they ask for it back.

**When testing a layout/styling fix, isolate one change at a time rather than batching multiple fixes.**
Why: User asked to see the effect of `numberOfLines` alone before considering flex/width changes, to keep a clear mental model of which change caused which effect.
How to apply: For UI/styling debugging, apply and test one type of change, get feedback, then move to the next — don't bundle fixes preemptively.

**Drop validating language ("you're right", "good call", "that makes sense") — it's frustrating to listen to.**
Why: User explicitly said stop validating what he's doing; work productively and supportively instead, without the affirming preamble.
How to apply: Skip the agreement/praise sentence at the start of replies. Go straight to the content, action, or instructions.

**For iterative style/layout tuning, give written instructions for the user to apply themselves rather than making edit after edit.**
Why: User wants to play with values directly and review the diff afterward, rather than a back-and-forth of edits that get rejected/flip-flopped.
How to apply: When tuning is exploratory (font sizes, spacing, flex values), describe what to change and why, let the user make the edit, then review.

**Fixed `fontSize` values are fine and expected with Dynamic Type — don't avoid them.**
Why: User corrected the claim that fixed font sizes "don't work" with Dynamic Type. The actual requirement is that containers around text use flexible width/height (flex, minWidth) so they can absorb the scaled text, not that font sizes themselves must vary.
How to apply: When fixing Dynamic Type layout bugs, focus on container flex/width, not on second-guessing every fontSize value.
