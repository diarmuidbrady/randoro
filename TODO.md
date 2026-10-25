# TODO

Feature ideas and known work, distilled and concise. The user needs behind these live in [USER_NEEDS.md](USER_NEEDS.md). The guiding constraint on every feature: keep it simple, a user should start a workout in a few clicks.

## Bugs
No known bugs at this moment

## Feature ideas

### Round structure
- **Guided round mode:** beeps plus called combinations. Self-directed (random beeps) and free (Random Beeps off) already exist.
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
- Jet trail should be smoother. More dots slow the start (each adds native animation work), so an SVG line trail is the better route.
- Add the T wave back once P and QRS feel polished.
- SVG line trail instead of dot trail, so the waveform shape is visible as it draws.

### Music
- Control Spotify or a preferred music app from within Randoro without leaving the app.

### Sport presets (further out)
- The UI is boxing-specific. Other sports (hurling, running) have shown interest. Boxing stays the default; add sport-specific presets and setup variants later.

## Release
- App icon: finalise QRS waveform design, integrate into the build.
