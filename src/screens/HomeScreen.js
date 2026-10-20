import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FONT_SIZE = 52;
const TRAVEL_DURATION = 1750;

const O_START_X = -SCREEN_WIDTH * 0.65;
const O_END_X = 0;
const DOT_END_X_OFFSET = -13; // tune this to shift only the dot left/right at landing

const DOT_SIZE = 10;
// Scale factor to grow dot up to roughly the 'o' glyph diameter
const DOT_TO_O_SCALE = FONT_SIZE / DOT_SIZE * 0.54; // 0.72 tunes for glyph vs font-size ratio


// QRS waveform segment boundaries (as fraction of total travel 0→1)
// Flat → P → PR → Q → R → S → Flat
// Q dips at 'n' (~0.40), R peaks at 'd' (~0.54), S ends at 'o' (~0.68)
const SEG_P_START   = 0.08;
const SEG_P_END     = 0.20;
const SEG_PR_END    = 0.53;
const SEG_Q_END     = 0.63;
const SEG_R_END     = 0.73;
const SEG_S_END     = 0.83;
// remainder is flat baseline to end

const AMP = 20;
const P_HEIGHT  = AMP * 0.25;
const R_HEIGHT  = AMP * 6.0;
const Q_DEPTH   = AMP * 2.0;
const S_DEPTH   = AMP * 2.0;

const TRAIL_LENGTH = 60;
const DOT_COLOR_WHITE = '#FFFFFF';
const DOT_COLOR_RED   = '#EF4444';

function computeY(progress) {
  const p = progress;

  function local(start, end) {
    return (p - start) / (end - start);
  }

  // Flat lead-in
  if (p < SEG_P_START) return 0;

  // P wave: smooth rounded bump upward (sine arch)
  if (p < SEG_P_END) {
    const t = local(SEG_P_START, SEG_P_END);
    return -P_HEIGHT * Math.sin(t * Math.PI);
  }

  // PR segment: flat
  if (p < SEG_PR_END) return 0;

  // Q dip: sharp V down
  if (p < SEG_Q_END) {
    const t = local(SEG_PR_END, SEG_Q_END);
    return t < 0.5
      ? Q_DEPTH * (t / 0.5)
      : Q_DEPTH * (1 - (t - 0.5) / 0.5);
  }

  // R peak: sharp V up
  if (p < SEG_R_END) {
    const t = local(SEG_Q_END, SEG_R_END);
    return t < 0.5
      ? -R_HEIGHT * (t / 0.5)
      : -R_HEIGHT * (1 - (t - 0.5) / 0.5);
  }

  // S dip: sharp V down
  if (p < SEG_S_END) {
    const t = local(SEG_R_END, SEG_S_END);
    return t < 0.5
      ? S_DEPTH * (t / 0.5)
      : S_DEPTH * (1 - (t - 0.5) / 0.5);
  }

  // Flat tail
  return 0;
}

// The ECG path as lookup tables over travel progress (0→1), interpolated by the
// native driver. Driving it from JS dropped frames on Android.
const SEGMENT_CORNERS = [
  SEG_P_START, SEG_P_END, SEG_PR_END,
  (SEG_PR_END + SEG_Q_END) / 2, SEG_Q_END,
  (SEG_Q_END + SEG_R_END) / 2, SEG_R_END,
  (SEG_R_END + SEG_S_END) / 2, SEG_S_END,
];
const P_WAVE_SAMPLES = Array.from({ length: 13 }, (_, i) => SEG_P_START + ((SEG_P_END - SEG_P_START) * i) / 12);
const PATH_INPUT = [...new Set([0, 1, ...SEGMENT_CORNERS, ...P_WAVE_SAMPLES])].sort((a, b) => a - b);
const PATH_Y = PATH_INPUT.map(computeY);

// The dot is red on the R spike only.
const RED_EDGE = 0.0001;
const RED_INPUT = [0, SEG_Q_END - RED_EDGE, SEG_Q_END, SEG_R_END, SEG_R_END + RED_EDGE, 1];
const RED_ON    = [0, 0, 1, 1, 0, 0];
const WHITE_ON  = [1, 1, 0, 0, 1, 1];

// Trail dots sit one 60 fps frame of travel behind each other.
const TRAIL_STEP = 1000 / 60 / TRAVEL_DURATION;
const TRAIL_AGES = Array.from({ length: TRAIL_LENGTH - 1 }, (_, i) => i + 1);
const ABSORB_DURATION = 300;
// How far the trail's last dot runs behind the head, in travel progress.
const TRAIL_SPAN = (TRAIL_LENGTH - 1) * TRAIL_STEP;
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
  const catchUp      = useRef(new Animated.Value(0)).current; // trail closes onto the landing point, 0→1
  const trailOpacity = useRef(new Animated.Value(1)).current;

  const dotOpacity = useRef(new Animated.Value(1)).current;
  const dotScale   = useRef(new Animated.Value(1)).current;
  const oOpacity   = useRef(new Animated.Value(0)).current;

  const dividerScale = useRef(new Animated.Value(0)).current;
  const wordOpacities = useRef(TAGLINE_WORDS.map(() => new Animated.Value(0))).current;

  const dashOffset = useRef(new Animated.Value(HALF_PERIMETER)).current;
  const prepareOpacity = useRef(new Animated.Value(0)).current;

  const timersRef = useRef([]);

  const motionRef = useRef(null);
  if (!motionRef.current) {
    const head = pathAt(progress);
    motionRef.current = {
      // Progress of the trail's last dot.
      tail: Animated.subtract(progress, catchUp.interpolate({ inputRange: [0, 1], outputRange: [TRAIL_SPAN, 0] })),
      head: {
        ...head,
        whiteOpacity: Animated.multiply(dotOpacity, head.white),
        redOpacity: Animated.multiply(dotOpacity, head.red),
      },
      trail: TRAIL_AGES.map(age => {
        const lag = catchUp.interpolate({ inputRange: [0, 1], outputRange: [age * TRAIL_STEP, 0] });
        const dot = pathAt(Animated.subtract(progress, lag));
        const fade = Animated.multiply(trailOpacity, 1 - age / TRAIL_LENGTH);
        return {
          age,
          ...dot,
          scale: Math.max(0.1, 1 - age / TRAIL_LENGTH),
          whiteOpacity: Animated.multiply(fade, dot.white),
          redOpacity: Animated.multiply(fade, dot.red),
        };
      }),
    };
  }
  const motion = motionRef.current;
  const [isReady, setIsReady] = useState(false); // GET READY is tappable once visible
  const [revealAt, setRevealAt] = useState(null); // travel progress at each letter's centre

  // Each letter fades in as the end of the trail passes its centre. Driven by
  // the same native values as the trail, so they stay in step on Android.
  const letterOpacities = useMemo(() => letterLayouts.current.map((_, i) => (
    revealAt
      ? motion.tail.interpolate({
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
    Animated.timing(progress, {
      toValue: 1,
      duration: TRAVEL_DURATION,
      delay: 50,
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

    // t=850ms: "to", "the" step in
    [1, 2].forEach((wordIdx, i) => {
      later(() => {
        Animated.timing(wordOpacities[wordIdx], {
          toValue: SETTLED_OPACITY, duration: 150, useNativeDriver: true,
        }).start();
      }, 850 + i * 150);
    });

    // t=1400ms: "unpredictable" flashes, then phase 3
    later(() => {
      flashWord(wordOpacities[3], () => startPhase3());
    }, 1400);
  }

  function startPhase3() {
    later(() => {
      Animated.timing(dashOffset, {
        toValue: 0, duration: 400, useNativeDriver: true,
      }).start(() => {
        Animated.timing(prepareOpacity, {
          toValue: 1, duration: 200, useNativeDriver: true,
        }).start(() => setIsReady(true));
      });
    }, 300);
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
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[0] }]} onLayout={e => onLetterLayout(0, e)}>r</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[1] }]} onLayout={e => onLetterLayout(1, e)}>a</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[2] }]} onLayout={e => onLetterLayout(2, e)}>n</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[3] }]} onLayout={e => onLetterLayout(3, e)}>d</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[4] }]} onLayout={e => onLetterLayout(4, e)}>o</Animated.Text>
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: letterOpacities[5] }]} onLayout={e => onLetterLayout(5, e)}>r</Animated.Text>
          {/* Invisible placeholder keeps row width = "randoro" for correct centering */}
          <Animated.Text maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER} style={[styles.title, { opacity: 0 }]} onLayout={onORestLayout}>o</Animated.Text>

          {/* Trail dots */}
          {motion.trail.map(dot => (
            <TravellingDot
              key={dot.age}
              transform={[
                { translateX: dot.x },
                { translateY: dot.y },
                { translateX: DOT_END_X_OFFSET },
                { scale: dot.scale },
              ]}
              whiteOpacity={dot.whiteOpacity}
              redOpacity={dot.redOpacity}
            />
          ))}

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
    backgroundColor: '#1C1C1E',
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
    right: 0,
    top: FONT_SIZE * 0.62,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: DOT_COLOR_WHITE,
    alignSelf: 'center',
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
