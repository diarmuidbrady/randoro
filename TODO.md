# TODO

## Bugs

- **Splash screen / animation flicker**: With `startTime + 500` delay in HomeScreen.js, the dot briefly appears at the left edge before disappearing, then re-appears and travels. Root cause: one RAF frame renders before the delay fires. Fix: gate the first RAF frame behind the same delay, or initialise dot opacity to 0 and only show it when the animation actually starts.

## App improvements

- Update dot in HomeScreen animation to follow exact QRS waveform path (P, Q, R, S, T waves)
- Animation: jet trail on dot
- Animation: dot fades red during QRS portion

## Release

- App icon: finalise QRS waveform design, integrate into build
- App Store submission
