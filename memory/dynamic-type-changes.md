# Randoro — Dynamic Type Support

React Native `Text` scales with the user's iOS text-size setting by default (`allowFontScaling` is `true`). So the app's text was already growing — the failures came from layout that assumed default-size text: fixed widths, single-line rows, and animation geometry derived from a hard-coded font size. The fix is therefore not "enable scaling" but: let text scale wherever the layout can absorb it, make containers adapt (wrap, shrink, grow in height), and deliberately cap or shrink-to-fit the few elements whose geometry cannot adapt. All timer, audio, animation, navigation, and state logic is untouched; changes are limited to `Text` props (`maxFontSizeMultiplier`, `numberOfLines`, `adjustsFontSizeToFit`) and small additions to existing styles (`flexWrap`, `flexShrink`, `minWidth`, `gap`, `textAlign`).

For reference, iOS text-size multipliers range from ~0.82 (xSmall) through 1.0 (Large, the default) to ~1.35 (xxxLarge), and up to ~3.1 at the largest Accessibility size (AX5).

---

## HomeScreen.js

### Assessment

The screen has three text groups with very different tolerance for scaling:

1. **The "randoro" wordmark and dot animation.** This is pixel-tuned geometry, not body text. The dot's vertical position (`top: FONT_SIZE * 0.62`), its growth into the 'o' glyph (`DOT_TO_O_SCALE = FONT_SIZE / DOT_SIZE * 0.54`), the landing offset (`DOT_END_X_OFFSET = -13`), and the ECG waveform amplitudes are all calibrated against the constant `FONT_SIZE = 52` — but system font scaling changes the *rendered* size without changing the constant. At any scale above 1x the dot lands in the wrong place vertically, grows to the wrong diameter relative to the 'o', and at ~1.3x+ the 52pt title (already ~240pt wide with letter spacing) overflows the padded screen width and the letter row wraps, breaking the reveal animation entirely (reveal thresholds come from `onLayout` of letters that are no longer on one line).
2. **The tagline** ("react to the unpredictable"): already in a `flexWrap` row of per-word `Text` elements — it scales and wraps gracefully with no changes.
3. **The GET READY button**: the label sits inside a fixed 68 × (width−80) pill whose outline is an SVG stroke-draw animation. The SVG paths, radius, and `HALF_PERIMETER` dash length are all derived from the fixed dimensions, so the pill cannot simply grow with text without recomputing the whole animation. Uncapped, the 20pt label reaches ~62pt at AX5 and overflows the 68pt pill vertically.

### Solution and rationale

- **Wordmark pinned at 1x** via `maxFontSizeMultiplier={1}` on the six letters, the invisible placeholder 'o', and the settled travelling 'o'. Apple's Human Interface Guidelines explicitly exempt logos and wordmarks from Dynamic Type ("it's not necessary to scale text in a logo"), and this is a decorative splash animation carrying no information the user must read — the informational text on the screen (tagline, button) does scale. Pinning keeps every piece of tuned geometry valid with zero risk to the animation. (The alternative — scaling the wordmark and multiplying all dot geometry by the effective font scale — was rejected: the hand-tuned `-13` landing offset and the `0.54` glyph-ratio fudge factor don't provably scale linearly, and the title would still overflow small screens above ~1.2x, forcing a cap anyway for marginal benefit on decoration.)
- **Button label capped at 2x** (`maxFontSizeMultiplier={2}`) — 40pt text fits comfortably inside the 68pt pill — with `numberOfLines={1}` + `adjustsFontSizeToFit` as a safety net so "GET READY" shrinks rather than clips on narrow devices. This preserves the SVG stroke-draw animation exactly while still doubling the CTA's size for accessibility users.
- **Tagline**: no change needed; it scales and wraps natively.

### Specific changes

- Added two documented constants: `TITLE_MAX_FONT_MULTIPLIER = 1`, `BUTTON_TEXT_MAX_FONT_MULTIPLIER = 2`.
- Added `maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER}` to the six letter `Animated.Text`s, the placeholder 'o', and the travelling 'o'.
- Added `maxFontSizeMultiplier={BUTTON_TEXT_MAX_FONT_MULTIPLIER}`, `numberOfLines={1}`, `adjustsFontSizeToFit` to the GET READY label.

### Expected outcome

- **Default–xxxLarge (≤1.35x)**: wordmark and animation identical to today; tagline modestly larger, wrapping to a second line if needed; GET READY up to ~27pt inside the unchanged pill.
- **Accessibility sizes (up to ~3.1x)**: wordmark/animation still pixel-perfect at 1x; tagline scales fully and wraps across lines ("unpredictable" may character-wrap at the very largest size — cosmetic only); GET READY renders at 40pt (2x cap), shrinking slightly on very narrow devices instead of clipping. No truncation, no broken animation at any size.

---

## SetupScreen.js

### Assessment

The screen is a `ScrollView`, so vertical growth is free — the problems are all horizontal, in fixed-width single-line rows:

- **Warm Up / Cool Down and Feedback rows**: `space-between` rows where a scaled label ("Screen Flash" at 3x ≈ full row width) pushes the `Switch` or the time display off-screen, because the labels had no `flexShrink`.
- **Rounds + Work/Rest row**: the tightest layout in the app — rounds block, Work block, swap button, and Rest block all on one line. The `00:00` displays are 20pt; at 3x each is ~150pt wide, roughly double the available space. Nothing could wrap or shrink.
- **Intensity / Combo rows**: a fixed `width: 64` label next to a segmented control. Scaled label text was forced to wrap into a narrow column of characters inside 64pt, and the segment buttons' 12pt labels ("Medium") overflowed their `flex:1` cells.
- **Not problems**: the native `Picker` modals handle Dynamic Type themselves; the tooltip's fixed `lineHeight: 20` is safe because RN multiplies `lineHeight` by the font scale along with `fontSize`; the ENTER button's height is padding-driven and its short label fits at all scales; section labels wrap naturally.

### Solution and rationale

Adapt the containers rather than cap the text — this is a settings form the user actually reads, so it should honor the full accessibility range. Three techniques:

1. **`flexShrink: 1` on row labels** (`secondaryLabel`, `toggleLabel`) so a long scaled label wraps within its row instead of evicting the control beside it. Rows grow taller; controls stay visible.
2. **`flexWrap` + `minWidth` for the two dense rows.** `roundsRow` and `pickerRow` get `flexWrap: 'wrap'`; the group beside the label (`workRestRow` with `minWidth: 200`, `segmentRow` with `minWidth: 180`) keeps its `flex: 1` so at default sizes it fills the same line exactly as before, but when scaled content leaves it less than its minimum width, it wraps onto its own full-width line below. The min-widths were chosen so the wrap never triggers at default text size, even on an iPhone SE. The existing `gap: 16` / `gap: 10` applies between wrapped lines too, so spacing stays consistent.
3. **Shrink-to-fit on the numeric duration readouts** (`numberOfLines={1}` + `adjustsFontSizeToFit` on the `00:00` displays in both `DurationPicker` variants). These are fixed-format `MM:SS` readouts inside width-constrained blocks; letting them shrink to the block width guarantees they never clip mid-digits, while still rendering as large as space allows.

Small supporting changes: `pickerLabel` goes from `width: 64` to `minWidth: 64` + `flexShrink: 1` so "Combo Count" takes its natural width when scaled instead of stacking characters vertically (at default size "Intensity" is unchanged; "Combo Count" now sits on one line rather than two — a minor improvement in the same spirit); `segmentButtonText` gets `textAlign: 'center'` so labels that wrap to two lines inside a segment stay centered; the decorative `↔` swap glyph is capped at 2x (`maxFontSizeMultiplier={2}`) like the other icon glyphs so it doesn't dominate the row — it's a symbol, not text.

### Specific changes

- `secondaryLabel`, `toggleLabel`: added `flexShrink: 1`.
- `roundsRow`: added `flexWrap: 'wrap'`. `workRestRow`: added `minWidth: 200`.
- `pickerRow`: added `flexWrap: 'wrap'`. `pickerLabel`: `width: 64` → `minWidth: 64` + `flexShrink: 1`. `segmentRow`: added `minWidth: 180`. `segmentButtonText`: added `textAlign: 'center'`.
- Both `durationDisplay` render sites in `DurationPicker`: added `numberOfLines={1}` `adjustsFontSizeToFit`.
- Swap `↔` icon: added `maxFontSizeMultiplier={2}`.

### Expected outcome

- **Default–xxxLarge**: layout visually identical to today (the wrap thresholds don't trigger); text up to 35% larger; rows a little taller; everything scrolls.
- **Accessibility sizes**: labels wrap within their rows and switches/pickers remain on-screen and tappable; the Work ↔ Rest group and each segmented control drop onto their own full-width line beneath their labels, with the cards growing vertically; `MM:SS` readouts render as large as their blocks allow and never truncate; segment labels wrap to two centered lines inside taller buttons. All controls remain reachable and operable at AX5.

---

## RunningScreen.js

### Assessment

This is the glanceable in-workout screen — a fixed (non-scrolling) flex column, so vertical space is finite and horizontal overflow was the main failure:

- **Top bar**: `✕` in a fixed `width: 32` box (clips when scaled) and a phase label with no width constraint between the icon and the balancing spacer (overflows / pushes the bar apart at large sizes).
- **Countdown**: `fontSize: 88`. Even the non-accessibility maximum (1.35x ≈ 119pt) makes `MM:SS` wider than the screen — the single most visible breakage.
- **Round row**: `roundInfo` had `minWidth: 160` but no ability to shrink, so "Round 3 of 12" at large sizes pushed the ‹ › chevrons off-screen.
- **Stats row**: two `space-between` columns whose values ("12:34" at 3x ≈ 190pt each) collide in the middle.
- **Play/pause button**: height is padding-driven (fine — it grows), but "RESUME" at 3x (~62pt) overflows the button width.
- **Not problems**: the flash color inversion, tick loop, and audio are pure logic; the timer block is `flex: 1` and absorbs vertical growth from the other rows.

### Solution and rationale

The dominant technique here is **shrink-to-fit on single-line numeric/label displays** (`numberOfLines={1}` + `adjustsFontSizeToFit`). During a workout, values like the countdown must be readable at a glance and must never clip or wrap — a two-line `MM:\nSS` would be worse than smaller text. `adjustsFontSizeToFit` gives the ideal behavior: text renders at the user's requested scale whenever it fits, and gracefully steps down to exactly fill the available width when it doesn't. Applied to the countdown (which at 88pt base already fills most of the width — this effectively lets accessibility users get a wall-to-wall timer without ever overflowing), the phase label, both stat values and labels, and the play/pause label.

Supporting layout changes give those texts a real width bound to shrink into: `phaseLabel` becomes `flex: 1` + centered so it owns the space between the ✕ and the spacer; `timerBlock` gets `paddingHorizontal: 16` so a maximally-shrunk countdown doesn't touch the screen edges; `statBlock` gets `flexShrink: 1` and `statsRow` a `gap: 16` so the two columns compress toward each other with a guaranteed gutter instead of colliding; `roundInfo` gets `flexShrink: 1` (keeping its `minWidth: 160`) with `textAlign: 'center'` on the text so "Round X of Y" wraps to a centered second line at extreme sizes while the chevrons stay on-screen.

The `✕` and `‹ ›` glyphs are icon-like controls, not prose; they're capped at 2x (`maxFontSizeMultiplier={2}`) — still twice as large for accessibility users, without a 110pt chevron consuming the vertical budget the countdown needs. Their tap targets already exceed the glyphs via `hitSlop`/padding. `topBarIcon`'s `width: 32` becomes `minWidth: 32` so the scaled glyph is never clipped while the bar's balance is preserved at default size.

### Specific changes

- `✕`, `‹`, `›`: added `maxFontSizeMultiplier={2}`. `topBarIcon`: `width: 32` → `minWidth: 32`.
- Phase label: added `numberOfLines={1}` `adjustsFontSizeToFit`; `phaseLabel` style gains `flex: 1`, `textAlign: 'center'`.
- Countdown: added `numberOfLines={1}` `adjustsFontSizeToFit`; `timerBlock` gains `paddingHorizontal: 16`.
- `roundInfo`: added `flexShrink: 1`; `roundText`: added `textAlign: 'center'`.
- Stat values and labels (×4): added `numberOfLines={1}` `adjustsFontSizeToFit`; `statBlock` gains `flexShrink: 1`; `statsRow` gains `gap: 16`.
- Play/pause label: added `numberOfLines={1}` `adjustsFontSizeToFit`.

### Expected outcome

- **Default–xxxLarge**: layout essentially identical; countdown grows toward ~119pt until it meets the screen width, then holds at the largest size that fits; phase label, stats, and button label scale fully.
- **Accessibility sizes**: the countdown fills the available width edge-padding to edge-padding — larger than today, never clipped; phase label and stat values shrink only as much as needed to stay on one line; "Round X of Y" wraps to a centered second line between visible chevrons; the play/pause pill grows taller with its label and never overflows; the flash inversion, phase jumping, and all timing behavior are unchanged. Nothing truncates with an ellipsis and no row pushes another off-screen at any supported text size.

---

## Notes and limitations

- `adjustsFontSizeToFit` is used only on short, single-line, fixed-format strings (times, one-word labels, button captions) where wrapping would be worse than modest shrinking — reading content (setup labels, tagline, tooltips) scales fully and wraps instead.
- Caps (`maxFontSizeMultiplier`) are used only on the wordmark (HIG logo exemption), icon glyphs (✕ ‹ › ↔), and the GET READY label constrained by its SVG animation — never on informational text.
- If the user changes text size while the app is running, iOS relaunch/relayout applies the new scale on the next render; no in-app handling is required for these changes.
- Worth testing on device at: default, xxxLarge (largest non-accessibility), AX1, and AX5, on both a small (SE) and standard-width iPhone.
