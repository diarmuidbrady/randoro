import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FONT_SIZE = 52;
const TRAVEL_DURATION = 1000;
const WAVE_START_PROGRESS = 0.20;

const O_START_X = -SCREEN_WIDTH * 0.65;
const O_END_X = 0;
const DOT_END_X_OFFSET = -13; // tune this to shift only the dot left/right at landing

const DOT_SIZE = 10;
// Scale factor to grow dot up to roughly the 'o' glyph diameter
const DOT_TO_O_SCALE = FONT_SIZE / DOT_SIZE * 0.54; // 0.72 tunes for glyph vs font-size ratio

// HB_WIDTH: fraction of wave region per heartbeat burst — increase to slow heartbeat relative to sine.
// SINE_CYCLES: oscillations per sine segment — increase for faster sine movement.
const HB_WIDTH = 0.23;
const SINE_CYCLES = 0.5;
const HB_AMP_MULT = 2;
const HEARTBEAT_CYCLES = 1

function computeY(progress) {
  if (progress < WAVE_START_PROGRESS) return 0;

  const AMP = 15;
  const p = (progress - WAVE_START_PROGRESS) / (1 - WAVE_START_PROGRESS);

  // Two heartbeats at ~30% and ~70% of the wave region, sine fills the gaps, flat at end.
  // All boundaries derived from HB_WIDTH — one number controls the balance.
  const s1End  = (0.60 - HB_WIDTH) / 2;
  const hb1End = s1End + HB_WIDTH;
  const s2End  = hb1End + (0.60 - HB_WIDTH) / 2;
  const hb2End = s2End + HB_WIDTH;

  const segments = [
    { end: s1End,  type: 'sine',      cycles: SINE_CYCLES },
    { end: hb1End, type: 'heartbeat'                      },
    { end: s2End,  type: 'sine',      cycles: SINE_CYCLES },
    { end: hb2End, type: 'heartbeat'                      },
    { end: 1.00,   type: 'flat'                           },
  ];

  let segStart = 0;
  for (const seg of segments) {
    if (p <= seg.end) {
      const local = (p - segStart) / (seg.end - segStart);
      if (seg.type === 'flat') return 0;
      if (seg.type === 'sine') {
        return -AMP * Math.sin(local * Math.PI * 2 * seg.cycles);
      }
      if (seg.type === 'heartbeat') {
        // One continuous sine wave: up → down → up, no flat gaps between peaks.
        // sin starting at π goes: 0 → -1 → 0 → +1 → 0 over 2π, giving centre→up→centre→down→centre.
        return -AMP * HB_AMP_MULT * Math.sin(local * Math.PI * HEARTBEAT_CYCLES + Math.PI);
      }
    }
    segStart = seg.end;
  }
  return 0;
}

const BUTTON_H = 68;
const BUTTON_W = SCREEN_WIDTH - 80;
const RADIUS = BUTTON_H / 2;
const STRAIGHT = BUTTON_W - 2 * RADIUS;
const HALF_PERIMETER = Math.PI * RADIUS + STRAIGHT;

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CW_PATH  = `M ${BUTTON_W / 2} 0 L ${BUTTON_W - RADIUS} 0 A ${RADIUS} ${RADIUS} 0 0 1 ${BUTTON_W - RADIUS} ${BUTTON_H} L ${BUTTON_W / 2} ${BUTTON_H}`;
const CCW_PATH = `M ${BUTTON_W / 2} 0 L ${RADIUS} 0 A ${RADIUS} ${RADIUS} 0 0 0 ${RADIUS} ${BUTTON_H} L ${BUTTON_W / 2} ${BUTTON_H}`;

const TAGLINE_WORDS = ['react', 'to', 'the', 'unpredictable'];
const SETTLED_OPACITY = 0.6;
const FLASH_OPACITY = 1.0;

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const letterLayouts = useRef([null, null, null, null, null, null]);
  const oRestLayout = useRef(null);
  const revealThresholdsRef = useRef(null);

  const travelX = useRef(new Animated.Value(O_START_X)).current;
  const travelY = useRef(new Animated.Value(0)).current;
  const letterOpacities = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;

  const dotOpacity = useRef(new Animated.Value(1)).current;
  const dotScale   = useRef(new Animated.Value(1)).current;
  const oOpacity   = useRef(new Animated.Value(0)).current;

  const dividerScale = useRef(new Animated.Value(0)).current;
  const wordOpacities = useRef(TAGLINE_WORDS.map(() => new Animated.Value(0))).current;

  const dashOffset = useRef(new Animated.Value(HALF_PERIMETER)).current;
  const prepareOpacity = useRef(new Animated.Value(0)).current;

  const rafRef = useRef(null);

  function computeRevealThresholds() {
    if (!oRestLayout.current || !letterLayouts.current.every(l => l !== null)) return;
    const oCentreAtRest = oRestLayout.current.x + oRestLayout.current.width / 2;
    revealThresholdsRef.current = letterLayouts.current.map(l => {
      const lCentre = l.x + l.width / 2;
      return lCentre - oCentreAtRest;
    });
  }

  useEffect(() => {
    const revealed = [false, false, false, false, false, false];
    const startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / TRAVEL_DURATION, 1);
      const currentX = O_START_X + progress * (O_END_X - O_START_X);
      const currentY = computeY(progress);

      travelX.setValue(currentX);
      travelY.setValue(currentY);

      if (revealThresholdsRef.current) {
        revealThresholdsRef.current.forEach((threshold, i) => {
          if (!revealed[i] && currentX >= threshold) {
            revealed[i] = true;
            setTimeout(() => {
              Animated.timing(letterOpacities[i], {
                toValue: 1, duration: 150, useNativeDriver: true,
              }).start();
            }, 110);
          }
        });
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Step 1: dot expands to full 'o' size
        Animated.timing(dotScale, {
          toValue: DOT_TO_O_SCALE, duration: 300, useNativeDriver: true,
        }).start(() => {
          // Step 2: 'o' snaps in, dot fades out simultaneously
          oOpacity.setValue(1);
          Animated.timing(dotOpacity, {
            toValue: 0, duration: 150, useNativeDriver: true,
          }).start(() => startPhase2());
        });
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
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
    setTimeout(() => {
      flashWord(wordOpacities[0], undefined);
    }, 500);

    // t=850ms: "to", "the" step in
    [1, 2].forEach((wordIdx, i) => {
      setTimeout(() => {
        Animated.timing(wordOpacities[wordIdx], {
          toValue: SETTLED_OPACITY, duration: 150, useNativeDriver: true,
        }).start();
      }, 850 + i * 150);
    });

    // t=1400ms: "unpredictable" flashes, then phase 3
    setTimeout(() => {
      flashWord(wordOpacities[3], () => startPhase3());
    }, 1400);
  }

  function startPhase3() {
    setTimeout(() => {
      Animated.timing(dashOffset, {
        toValue: 0, duration: 400, useNativeDriver: true,
      }).start(() => {
        Animated.timing(prepareOpacity, {
          toValue: 1, duration: 200, useNativeDriver: true,
        }).start();
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

  const travelTransform = [{ translateX: travelX }, { translateY: travelY }];

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>

        <View style={styles.titleRow}>
          <Animated.Text style={[styles.title, { opacity: letterOpacities[0] }]} onLayout={e => onLetterLayout(0, e)}>r</Animated.Text>
          <Animated.Text style={[styles.title, { opacity: letterOpacities[1] }]} onLayout={e => onLetterLayout(1, e)}>a</Animated.Text>
          <Animated.Text style={[styles.title, { opacity: letterOpacities[2] }]} onLayout={e => onLetterLayout(2, e)}>n</Animated.Text>
          <Animated.Text style={[styles.title, { opacity: letterOpacities[3] }]} onLayout={e => onLetterLayout(3, e)}>d</Animated.Text>
          <Animated.Text style={[styles.title, { opacity: letterOpacities[4] }]} onLayout={e => onLetterLayout(4, e)}>o</Animated.Text>
          <Animated.Text style={[styles.title, { opacity: letterOpacities[5] }]} onLayout={e => onLetterLayout(5, e)}>r</Animated.Text>
          {/* Invisible placeholder keeps row width = "randoro" for correct centering */}
          <Animated.Text style={[styles.title, { opacity: 0 }]} onLayout={onORestLayout}>o</Animated.Text>

          {/* Travelling dot: solid circle, grows on landing to match 'o' size */}
          <Animated.View style={[
            styles.travellingDot,
            { opacity: dotOpacity, transform: [...travelTransform, { translateX: DOT_END_X_OFFSET }, { scale: dotScale }] },
          ]} />

          {/* Settled 'o': fades in as dot expands, then dot disappears leaving just this */}
          <Animated.Text style={[styles.title, styles.travellingO, { opacity: oOpacity, transform: travelTransform }]}>o</Animated.Text>
        </View>

        <Animated.View style={[styles.divider, { transform: [{ scaleX: dividerScale }] }]} />

        <View style={styles.taglineRow}>
          {TAGLINE_WORDS.map((word, i) => (
            <Animated.Text
              key={word}
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
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Setup')}>
          <Animated.Text style={[styles.buttonText, { opacity: prepareOpacity }]}>
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
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    top: FONT_SIZE * 0.62, // Tune vertical position to sit nicely within 'o' glyph
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#FFFFFF',
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
