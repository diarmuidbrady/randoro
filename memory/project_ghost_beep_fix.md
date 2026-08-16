---
name: ghost-beep-fix
description: Intermittent flash-with-no-sound was an un-awaited seekTo before play; fixed with await
metadata: 
  node_type: memory
  type: project
  originSessionId: a3b7ed7e-c584-4e86-b50f-d1bfef5975c3
  modified: 2026-08-16T10:21:37.305Z
---

**Symptom:** during a running workout, a random ping would flash the screen but play no sound. Intermittent, rare, hard to reproduce. Called the "ghost beep."

**Root cause:** in RunningScreen `playSound`, the shared ping player was rewound with `seekTo(0)` and then `play()` was called. `seekTo` returns a promise (finishes a moment later, not instantly). When a beep had finished it was parked at its end (`currentTime` = 0.100, the ping is 0.100s). On the next ping the rewind and the play collided — play ran before the rewind landed — and the beep was silently dropped. The player reported `paused` and never reached `didJustFinish`.

**Fix:** only rewind when needed, and `await` the rewind before playing:
```js
const playSound = useCallback(async (player) => {
  try {
    if (player.currentTime > 0) {
      await player.seekTo(0);
    }
    player.play();
  } catch {}
}, []);
```
Verified: a full 3x3 min workout with zero missing beeps (before the fix, one would appear within that time).

**How it was found (debugging method worth reusing):** polling `player.playing` / `currentTime` at a guessed delay was unreliable — `playing` reads false right after play even on good beeps. The trustworthy signal was `pingPlayer.addListener('playbackStatusUpdate', ...)`, which gives real engine fields: `timeControlStatus`, `didJustFinish`, `reasonForWaitingToPlay`, `isBuffering`. Logging those distinguished a real beep (buffer → playing → didJustFinish true) from a ghost beep (jumped straight to paused). For any expo-audio playback issue, use the status listener, not polling.

**Red herring:** `[MediaToolbox] FigFilePlayer signalled err=-12864` prints on every beep including good ones. Not related.

expo-audio version 1.1.1. Related: [[project_expo_go_native_modules]].
