# TODO

## Bugs

- **Splash screen / animation flicker**: With `startTime + 500` delay in HomeScreen.js, the dot briefly appears at the left edge before disappearing, then re-appears and travels. Root cause: one RAF frame renders before the delay fires. Fix: gate the first RAF frame behind the same delay, or initialise dot opacity to 0 and only show it when the animation actually starts.

## App improvements

- Animation: add heartbeat thump sound at R peak moment (progress crosses SEG_Q_END)
- Animation: T wave — add back after P, QRS feel polished
- Animation: SVG line trail instead of dot trail so waveform shape is visible as it draws

## Release

- App icon: finalise QRS waveform design, integrate into build
- App Store submission
