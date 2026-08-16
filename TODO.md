# TODO

Feature ideas and known work, distilled and concise. The user needs behind these live in [USER_NEEDS.md](USER_NEEDS.md). The guiding constraint on every feature: keep it simple, a user should start a workout in a few clicks.

## Bugs
- N/A

## Feature ideas

### Round structure
- **Countdown into a work round:** when the next round is a Work round, play prompt beeps at 10 seconds, then at 5, 4, 3, 2, and 1 second before it starts.
- **Round modes:** self-directed (beeps only, current), guided (beeps + called combinations), free (no beeps, athlete chooses when to punch — usable as a finisher or as a plain interval timer).
- **Varying intensity within a round:** e.g. high first minute, moderate second, high third to finish.
- **Workout presets:** named starting points, e.g. "3x3 Amateur Fight" (high intensity), "10x3 Professional" (moderate–high). Less to configure before starting.
- **Frequency / Attacks / Manual tabs:** three ways to set round difficulty. Frequency = wait time in seconds; Attacks = number of attacks; aligned low/med/high presets across both. Manual for custom.

### Guided training
- **Opponent type:** choose an opponent (opposite stance orthodox/southpaw, aggressive, tall/long, short/small) that shapes the round.
- **Guided mode:** a pre-round guide (choose opponent, read before starting) plus a choice of output — beeps or spoken prompts.
- **Voice / spoken prompts:** spoken cues instead of beeps, valuable for bag work where gloves prevent touching the phone.
- **Skill selection (on-cue and between-cue):** pick what to do on the cue (e.g. throw 1-2-1) and what to work on between cues (e.g. feints, footwork, defence). The gap between cues matters as much as the cue.
- **Explainer content:** short instructions or video for each skill, so users picking skills know how to perform them.

### Animation
- Make dot and jet trail thinner.
- Jet trail should span ~25% of screen width.
- Jet trail should be smoother — more trail points, closer to a continuous comet trail.
- Add heartbeat thump sound at the R peak moment.
- Add the T wave back once P and QRS feel polished.
- SVG line trail instead of dot trail, so the waveform shape is visible as it draws.

### Music
- Control Spotify or a preferred music app from within Randoro without leaving the app.

### Sport presets (further out)
- The UI is boxing-specific. Other sports (hurling, running) have shown interest. Boxing stays the default; add sport-specific presets and setup variants later.

## Release
- App icon: finalise QRS waveform design, integrate into the build.
- App Store submission.
