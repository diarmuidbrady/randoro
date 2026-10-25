import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useAudioPlayer } from 'expo-audio';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FONT_SIZE = 52;
const TRAVEL_DURATION = 1750;

const O_START_X = -SCREEN_WIDTH * 0.65;
const O_END_X = 0;
const TRAVEL_PX = O_END_X - O_START_X;
const DOT_END_X_OFFSET = -13; // tune this to shift only the dot left/right at landing
// The landing point's centre, from the title row's top-right corner (before DOT_END_X_OFFSET).
const DOT_CENTRE_RIGHT = 5;
const DOT_CENTRE_TOP = FONT_SIZE * 0.62 + 5;

// The trace is the ECG from the app icon (randoro-icon.svg: an 813-unit square,
// baseline at y 471), up to where its T wave starts. Points are [x, y] in icon units.
const ICON_BASELINE = 471;
const ICON_RED_FROM = 362.7; // the R spike leaves the baseline...
const ICON_R_PEAK = 406;
const ICON_RED_TO = 443.6;   // ...and returns to it
const ICON_TRACE_END = 607;
const ICON_STROKE = 8.5;
// P wave: the icon's quadratic curve from (103, 471) to (210, 471), control point (156.5, 358).
const ICON_P_WAVE = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  return [103 + 107 * t, ICON_BASELINE - 2 * t * (1 - t) * (ICON_BASELINE - 358)];
});
const ICON_TRACE = [
  [0, ICON_BASELINE],
  ...ICON_P_WAVE,
  [305, ICON_BASELINE],
  [350, 579],                     // Q
  [ICON_RED_FROM, ICON_BASELINE],
  [ICON_R_PEAK, 101.5],           // R
  [ICON_RED_TO, ICON_BASELINE],
  [464, 672],                     // S
  [515, ICON_BASELINE],
  [ICON_TRACE_END, ICON_BASELINE],
];
const ICON_SCALE = TRAVEL_PX / ICON_TRACE_END;

// The trace as lookup tables over travel progress (0→1), interpolated by the
// native driver. Driving it from JS dropped frames on Android.
const PATH_INPUT = ICON_TRACE.map(([x]) => x / ICON_TRACE_END);
const PATH_Y = ICON_TRACE.map(([, y]) => (y - ICON_BASELINE) * ICON_SCALE);
const TRACE_TOP = -Math.min(...PATH_Y);
const TRACE_BOTTOM = Math.max(...PATH_Y);

// The line has the icon's stroke width, and the dot matches it so the two read as one.
const LINE_WIDTH = ICON_STROKE * ICON_SCALE;
const DOT_SIZE = LINE_WIDTH;
// Scale factor to grow dot up to roughly the 'o' glyph diameter
const DOT_TO_O_SCALE = FONT_SIZE / DOT_SIZE * 0.54;

const BACKGROUND = '#1C1C1E';
const DOT_COLOR_WHITE = '#FFFFFF';
const DOT_COLOR_RED   = '#EF4444';

// The dot is red on the R spike only.
const RED_EDGE = 0.0001;
const RED_FROM = ICON_RED_FROM / ICON_TRACE_END;
const RED_TO = ICON_RED_TO / ICON_TRACE_END;
const RED_INPUT = [0, RED_FROM - RED_EDGE, RED_FROM, RED_TO, RED_TO + RED_EDGE, 1];
const RED_ON    = [0, 0, 1, 1, 0, 0];
const WHITE_ON  = [1, 1, 0, 0, 1, 1];

// The trail is static SVG strokes through the same points the dot follows,
// drawn up to the dot by dashes and faded out behind it by an overlay. Like the
// icon, it's round-ended white strokes with the red R spike drawn on top.
const TRAIL_PX = SCREEN_WIDTH * 0.25;
const TRAIL_PAD = LINE_WIDTH;
const TRAIL_W = TRAVEL_PX + 2 * TRAIL_PAD;
const TRAIL_H = TRACE_TOP + TRACE_BOTTOM + 2 * TRAIL_PAD;
const lineX = p => TRAIL_PAD + p * TRAVEL_PX;
const LINE_POINTS = PATH_INPUT.map((p, i) => [lineX(p), TRAIL_PAD + TRACE_TOP + PATH_Y[i]]);
// Distance along the line to each point. Between points it grows linearly
// with progress, like the dot's x and y, so a dash can end exactly at the dot.
const LINE_LENGTHS = [0];
for (let i = 1; i < LINE_POINTS.length; i++) {
  const [[x0, y0], [x1, y1]] = [LINE_POINTS[i - 1], LINE_POINTS[i]];
  LINE_LENGTHS.push(LINE_LENGTHS[i - 1] + Math.hypot(x1 - x0, y1 - y0));
}
// A stroke over points from..to, drawn as one dash longer than the stroke and
// a gap twice that. An offset of dash - length shows it up to that length.
// Before the dot reaches it, the offset sits past the dash's end, so no
// zero-length dash (a round dot) shows.
function lineStroke(from, to, colour) {
  const length = LINE_LENGTHS[to] - LINE_LENGTHS[from];
  const dash = length + 1;
  return {
    colour,
    d: 'M' + LINE_POINTS.slice(from, to + 1).map(([x, y]) => `${x},${y}`).join(' L'),
    dash,
    offsets: LINE_LENGTHS.map((l, i) => (i < from ? dash + 1 : dash - Math.min(l - LINE_LENGTHS[from], length))),
  };
}
const RED_FROM_POINT = ICON_TRACE.findIndex(([x]) => x === ICON_RED_FROM);
const RED_TO_POINT = ICON_TRACE.findIndex(([x]) => x === ICON_RED_TO);
const LINE_STROKES = [
  lineStroke(0, RED_FROM_POINT, DOT_COLOR_WHITE),
  lineStroke(RED_TO_POINT, ICON_TRACE.length - 1, DOT_COLOR_WHITE),
  lineStroke(RED_FROM_POINT, RED_TO_POINT, DOT_COLOR_RED),
];
const COVER_OVERLAP = 2; // the cover tucks under the fade's opaque end so no seam shows
const ABSORB_DURATION = 300;

// The heartbeat's thump lands on the R peak. It's played from the moment the
// dot first moves, which on Android can be well after mount.
const R_PEAK_MS = TRAVEL_DURATION * ICON_R_PEAK / ICON_TRACE_END;
const HEARTBEAT_THUMP_MS = 650; // thump position in heartbeat.wav (see scripts/make-heartbeat.sh)
const AUDIO_LATENCY_MS = 100;   // play() to sound; tune on device
// How far behind the dot (967 ms) each letter starts to appear, in travel progress.
const LETTER_LAG = 967 / TRAVEL_DURATION;
// A letter's fade-in, in travel progress (150 ms).
const LETTER_FADE = 150 / TRAVEL_DURATION;

// x, y and colour layers for a dot at the given travel progress.
function pathAt(progress) {
  const clamp = { extrapolate: 'clamp' };
  return {
    x: progress.interpolate({ inputRange: [0, 1], outputRange: [O_START_X, O_END_X], ...clamp }),
    y: progress.interpolate({ inputRange: PATH_INPUT, outputRange: PATH_Y, ...clamp }),
    red: progress.interpolate({ inputRange: RED_INPUT, outputRange: RED_ON, ...clamp }),
    white: progress.interpolate({ inputRange: RED_INPUT, outputRange: WHITE_ON, ...clamp }),
  };
}

// White and red layers: the native driver can't animate colour.
function TravellingDot({ transform, whiteOpacity, redOpacity }) {
  return (
    <>
      <Animated.View style={[styles.travellingDot, { transform, opacity: whiteOpacity, backgroundColor: DOT_COLOR_WHITE }]} />
      <Animated.View style={[styles.travellingDot, { transform, opacity: redOpacity, backgroundColor: DOT_COLOR_RED }]} />
    </>
  );
}

const BUTTON_H = 68;
const BUTTON_W = SCREEN_WIDTH - 80;
const RADIUS = BUTTON_H / 2;
const STRAIGHT = BUTTON_W - 2 * RADIUS;
const HALF_PERIMETER = Math.PI * RADIUS + STRAIGHT;

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CW_PATH  = `M ${BUTTON_W / 2} 0 L ${BUTTON_W - RADIUS} 0 A ${RADIUS} ${RADIUS} 0 0 1 ${BUTTON_W - RADIUS} ${BUTTON_H} L ${BUTTON_W / 2} ${BUTTON_H}`;
const CCW_PATH = `M ${BUTTON_W / 2} 0 L ${RADIUS} 0 A ${RADIUS} ${RADIUS} 0 0 0 ${RADIUS} ${BUTTON_H} L ${BUTTON_W / 2} ${BUTTON_H}`;

// ── Dynamic Type ──────────────────────────────────────────
// The "randoro" wordmark and its dot animation are pixel-tuned geometry
// (dot landing offset, dot→'o' scale ratio, ECG amplitudes are all derived
// from FONT_SIZE). Apple's HIG treats logos/wordmarks as exempt from Dynamic
// Type, so the wordmark is pinned at 1x to keep the animation aligned.
const TITLE_MAX_FONT_MULTIPLIER = 1;
// The GET READY label may scale up to 2x (40pt); the fixed 68pt SVG pill —
// whose stroke-draw animation depends on its exact perimeter — still fits it.
// adjustsFontSizeToFit is a safety net on narrow devices.
const BUTTON_TEXT_MAX_FONT_MULTIPLIER = 2;

const TAGLINE_WORDS = ['react', 'to', 'the', 'unpredictable'];
const SETTLED_OPACITY = 0.6;
const FLASH_OPACITY = 1.0;

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const letterLayouts = useRef([null, null, null, null, null, null]);
  const oRestLayout = useRef(null);

  const progress     = useRef(new Animated.Value(0)).current; // travel, 0→1
  const catchUp      = useRef(new Animated.Value(0)).current; // trail and letter lag close onto the landing point, 0→1
  const trailOpacity = useRef(new Animated.Value(1)).current;

  const dotOpacity = useRef(new Animated.Value(1)).current;
  const dotScale   = useRef(new Animated.Value(1)).current;
  const oOpacity   = useRef(new Animated.Value(0)).current;

  const dividerScale = useRef(new Animated.Value(0)).current;
  const wordOpacities = useRef(TAGLINE_WORDS.map(() => new Animated.Value(0))).current;

  const dashOffset = useRef(new Animated.Value(HALF_PERIMETER)).current;
  const prepareOpacity = useRef(new Animated.Value(0)).current;

  const timersRef = useRef([]);
  const heartbeat = useAudioPlayer(require('../../assets/heartbeat.wav'));

  const motionRef = useRef(null);
  if (!motionRef.current) {
    const head = pathAt(progress);
    const clamp = { extrapolate: 'clamp' };
    const lineHeadX = progress.interpolate({ inputRange: [0, 1], outputRange: [lineX(0), lineX(1)], ...clamp });
    motionRef.current = {
      // Progress at which letters appear.
      reveal: Animated.subtract(progress, catchUp.interpolate({ inputRange: [0, 1], outputRange: [LETTER_LAG, 0] })),
      head: {
        ...head,
        whiteOpacity: Animated.multiply(dotOpacity, head.white),
        redOpacity: Animated.multiply(dotOpacity, head.red),
      },
      trail: {
        dashOffsets: LINE_STROKES.map(stroke => (
          progress.interpolate({ inputRange: PATH_INPUT, outputRange: stroke.offsets, ...clamp })
        )),
        // The fade spans TRAIL_PX up to the dot and shrinks into it on landing.
        // scaleX works about the view's centre, so the shift makes up half the shrink.
        fadeX: Animated.add(lineHeadX, catchUp.interpolate({ inputRange: [0, 1], outputRange: [-TRAIL_PX, -TRAIL_PX / 2] })),
        fadeScale: catchUp.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        // The cover hides the line behind the fade.
        coverX: Animated.add(lineHeadX, catchUp.interpolate({
          inputRange: [0, 1],
          outputRange: [COVER_OVERLAP - TRAIL_PX - TRAIL_W, COVER_OVERLAP - TRAIL_W],
        })),
      },
    };
  }
  const motion = motionRef.current;
  const [isReady, setIsReady] = useState(false); // GET READY is tappable once visible
  const [revealAt, setRevealAt] = useState(null); // travel progress at each letter's centre

  // Each letter fades in LETTER_LAG after the dot passes its centre. Driven by
  // the same native values as the dot, so they stay in step on Android.
  const letterOpacities = useMemo(() => letterLayouts.current.map((_, i) => (
    revealAt
      ? motion.reveal.interpolate({
          inputRange: [revealAt[i], revealAt[i] + LETTER_FADE],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        })
      : 0
  )), [revealAt, motion]);

  function computeRevealThresholds() {
    if (!oRestLayout.current || !letterLayouts.current.every(l => l !== null)) return;
    const oCentreAtRest = oRestLayout.current.x + oRestLayout.current.width / 2;
    const points = letterLayouts.current.map(l => {
      const threshold = l.x + l.width / 2 - oCentreAtRest;
      const passAt = (threshold - O_START_X) / (O_END_X - O_START_X);
      return Math.min(1 - LETTER_FADE, Math.max(0, passAt));
    });
    setRevealAt(prev => prev ?? points);
  }

  function later(fn, ms) {
    timersRef.current.push(setTimeout(fn, ms));
  }

  useEffect(() => {
    const moveId = progress.addListener(({ value }) => {
      if (value <= 0) return;
      progress.removeListener(moveId);      later(() => heartbeat.play(), Math.max(0, R_PEAK_MS - HEARTBEAT_THUMP_MS - AUDIO_LATENCY_MS));
    });

    Animated.timing(progress, {
      toValue: 1,
      duration: TRAVEL_DURATION,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      // Trail closes onto the landing point while the dot grows to the 'o' size
      Animated.parallel([
        Animated.timing(catchUp, {
          toValue: 1, duration: ABSORB_DURATION, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(dotScale, {
          toValue: DOT_TO_O_SCALE, duration: 300, useNativeDriver: true,
        }),
      ]).start(({ finished: landed }) => {
        if (!landed) return;
        // The 'o' snaps in, the dot fades out
        trailOpacity.setValue(0);
        oOpacity.setValue(1);
        Animated.timing(dotOpacity, {
          toValue: 0, duration: 150, useNativeDriver: true,
        }).start(({ finished: faded }) => faded && startPhase2());
      });
    });

    return () => {
      [progress, catchUp, dotScale, dotOpacity].forEach(v => v.stopAnimation());
      timersRef.current.forEach(clearTimeout);
      progress.removeAllListeners();
    };
  }, []);

  function flashWord(opacityAnim, onDone) {
    opacityAnim.setValue(FLASH_OPACITY);
    Animated.timing(opacityAnim, {
      toValue: SETTLED_OPACITY, duration: 350, useNativeDriver: true,
    }).start(onDone);
  }

  function startPhase2() {
    // Divider appears instantly
    dividerScale.setValue(1);

    // t=500ms: "react" flashes
    later(() => {
      flashWord(wordOpacities[0], undefined);
    }, 500);

    // t=850ms: "to", "the" step in; GET READY starts drawing with "to"
    [1, 2].forEach((wordIdx, i) => {
      later(() => {
        Animated.timing(wordOpacities[wordIdx], {
          toValue: SETTLED_OPACITY, duration: 150, useNativeDriver: true,
        }).start();
      }, 850 + i * 150);
    });
    later(startPhase3, 850);

    // t=1400ms: "unpredictable" flashes
    later(() => {
      flashWord(wordOpacities[3], undefined);
    }, 1400);
  }

  function startPhase3() {
    Animated.timing(dashOffset, {
      toValue: 0, duration: 400, useNativeDriver: true,
    }).start(() => {
      Animated.timing(prepareOpacity, {
        toValue: 1, duration: 200, useNativeDriver: true,
      }).start(() => setIsReady(true));
    });
  }

  function onLetterLayout(i, e) {
    letterLayouts.current[i] = e.nativeEvent.layout;
    computeRevealThresholds();
  }

  function onORestLayout(e) {
    oRestLayout.current = e.nativeEvent.layout;
    computeRevealThresholds();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>

        <View style={styles.titleRow}>
          {/* Trail, beneath the letters. The overlays are background-coloured, so they only hide the line. */}
          <Animated.View style={[styles.trail, { opacity: trailOpacity }]}>
            <Svg width={TRAIL_W} height={TRAIL_H}>
              {LINE_STROKES.map((stroke, i) => (
                <AnimatedPath
                  key={i}
                  d={stroke.d}
                  fill="none"
                  stroke={stroke.colour}
                  strokeWidth={LINE_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={[stroke.dash, 2 * stroke.dash]}
                  strokeDashoffset={motion.trail.dashOffsets[i]}
                />
              ))}
            </Svg>
            <Animated.View style={[styles.trailCover, { transform: [{ translateX: motion.trail.coverX }] }]} />
            <Animated.View style={[styles.trailFade, { transform: [{ translateX: motion.trail.fadeX }, { scaleX: motion.trail.fadeScale }] }]}>
              <Svg width={TRAIL_PX} height={TRAIL_H}>
                <Defs>
                  <LinearGradient id="trailFade" x1={0} y1={0} x2={1} y2={0}>
                    <Stop offset={0} stopColor={BACKGROUND} stopOpacity={1} />
                    <Stop offset={1} stopColor={BACKGROUND} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect width={TRAIL_PX} height={TRAIL_H} fill="url(#trailFade)" />
              </Svg>
            </Animated.View>
          </Animated.View>

          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[0] }]} onLayout={e => onLetterLayout(0, e)}>r</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[1] }]} onLayout={e => onLetterLayout(1, e)}>a</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[2] }]} onLayout={e => onLetterLayout(2, e)}>n</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[3] }]} onLayout={e => onLetterLayout(3, e)}>d</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[4] }]} onLayout={e => onLetterLayout(4, e)}>o</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[5] }]} onLayout={e => onLetterLayout(5, e)}>r</Animated.Text>
          {/* Invisible placeholder keeps row width = "randoro" for correct centering */}
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: 0 }]} onLayout={onORestLayout}>o</Animated.Text>

          {/* Travelling dot */}
          <TravellingDot
            transform={[
              { translateX: motion.head.x },
              { translateY: motion.head.y },
              { translateX: DOT_END_X_OFFSET },
              { scale: dotScale },
            ]}
            whiteOpacity={motion.head.whiteOpacity}
            redOpacity={motion.head.redOpacity}
          />

          {/* Settled 'o' — only its opacity changes */}
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, styles.travellingO, { opacity: oOpacity }]}>o</Animated.Text>
        </View>

        <Animated.View style={[styles.divider, { transform: [{ scaleX: dividerScale }] }]} />

        <View style={styles.taglineRow}>
          {TAGLINE_WORDS.map((word, i) => (
            <Animated.Text
              key={word}
              numberOfLines={1}
              maxFontSizeMultiplier={2.5}
              style={[styles.taglineWord, { opacity: wordOpacities[i] }]}
            >
              {word}{i < 3 ? ' ' : ''}
            </Animated.Text>
          ))}
        </View>

      </View>

      <View style={[styles.buttonWrapper, { marginBottom: 32 }]}>
        <Svg width={BUTTON_W} height={BUTTON_H} style={StyleSheet.absoluteFill}>
          <AnimatedPath
            d={CW_PATH}
            fill="none"
            stroke="white"
            strokeWidth={2}
            strokeDasharray={`${HALF_PERIMETER}`}
            strokeDashoffset={dashOffset}
          />
          <AnimatedPath
            d={CCW_PATH}
            fill="none"
            stroke="white"
            strokeWidth={2}
            strokeDasharray={`${HALF_PERIMETER}`}
            strokeDashoffset={dashOffset}
          />
        </Svg>
        <TouchableOpacity style={styles.button} disabled={!isReady} onPress={() => navigation.navigate('Setup')}>
          <Animated.Text
            maxFontSizeMultiplier={BUTTON_TEXT_MAX_FONT_MULTIPLIER}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.buttonText, { opacity: prepareOpacity }]}
          >
            GET READY
          </Animated.Text>
        </TouchableOpacity>
      </View>


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
    paddingHorizontal: 40,
    justifyContent: 'space-between',
    overflow: 'visible',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'visible',
  },
  title: {
    fontSize: FONT_SIZE,
    fontWeight: '200',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  travellingDot: {
    position: 'absolute',
    right: DOT_CENTRE_RIGHT - DOT_SIZE / 2,
    top: DOT_CENTRE_TOP - DOT_SIZE / 2,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: DOT_COLOR_WHITE,
    alignSelf: 'center',
  },
  // Placed so the line's points land on the dot's centre.
  trail: {
    position: 'absolute',
    right: DOT_CENTRE_RIGHT - DOT_END_X_OFFSET - TRAIL_PAD,
    top: DOT_CENTRE_TOP - TRACE_TOP - TRAIL_PAD,
    width: TRAIL_W,
    height: TRAIL_H,
    overflow: 'hidden',
  },
  trailCover: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TRAIL_W,
    height: TRAIL_H,
    backgroundColor: BACKGROUND,
  },
  trailFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TRAIL_PX,
    height: TRAIL_H,
  },
  travellingO: {
    position: 'absolute',
    right: 0,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
    marginVertical: 20,
  },
  taglineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  taglineWord: {
    fontSize: 15,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  buttonWrapper: {
    height: BUTTON_H,
    width: BUTTON_W,
    alignSelf: 'center',
  },
  button: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: 3,
  },
});
