# TODO

## Bugs

- **Splash screen / animation flicker**: With `startTime + 500` delay in HomeScreen.js, the dot briefly appears at the left edge before disappearing, then re-appears and travels. Root cause: one RAF frame renders before the delay fires. Fix: gate the first RAF frame behind the same delay, or initialise dot opacity to 0 and only show it when the animation actually starts.
- **Setup screen: "Intensity" label wraps to second line on iPhone 16 with zoomed display.** Likely a font size / layout constraint issue. Fix: implement responsive text sizing or tighten the label layout so it fits at larger system font sizes.

## App improvements

### Animation
- Make dot and jet trail thinner
- Jet trail should span ~25% of screen width
- Jet trail should be smoother — increase number of trail points to reduce gaps between circles, closer to a continuous comet trail
- Add heartbeat thump sound at R peak moment (progress crosses SEG_Q_END)
- T wave — add back after P, QRS feel polished
- SVG line trail instead of dot trail so waveform shape is visible as it draws

### Sport presets (future)
- Current UI is boxing-specific. Other sports (hurling, running) expressed interest. Consider sport-specific presets and setup screen variants. Start with boxing as default, expand later.

### Coaching features (boxing coaches feedback)
- The space between cues matters as much as the cue itself. Users need to be practicing defence, footwork, feints in between, otherwise bad habits form (static or pointless movement).
- Allow users to pick what they do ON the cue (e.g. throw 1-2-1) and what they work on IN BETWEEN (e.g. lead feints). This gives structure to both moments.
- Explainer content: if users are picking skills, they need to know how to do them. Could be short video or instructions for each skill (e.g. how to throw a jab, a cross, a combination).

### Music integration
- Athletes want to control Spotify or preferred music app from within Randoro without leaving the app.

## Release

- App icon: finalise QRS waveform design, integrate into build
- App Store submission

---

## Feedback log

### 07 Jun 2026 — Post-Demos Anon feedback
Collected from hurling athletes, runners, and boxing coaches after presenting at Demos Anon (29 May 2026).
