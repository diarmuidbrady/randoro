import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
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

const RED_X_START = O_START_X + SEG_PR_END * (O_END_X - O_START_X);
const RED_X_END   = O_START_X + SEG_S_END  * (O_END_X - O_START_X);

const TRAIL_LENGTH = 12;
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
  const trailBufferRef = useRef([]);
  const [trailPositions, setTrailPositions] = useState([]);

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
    const startTime = Date.now() + 50;

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / TRAVEL_DURATION, 1);
      const currentX = O_START_X + progress * (O_END_X - O_START_X);
      const currentY = computeY(progress);

      travelX.setValue(currentX);
      travelY.setValue(currentY);

      const isRed = currentX >= RED_X_START && currentX <= RED_X_END;
      const buf = trailBufferRef.current;
      buf.push({ x: currentX, y: currentY, red: isRed });
      if (buf.length > TRAIL_LENGTH) buf.shift();
      setTrailPositions([...buf]);

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
        // Absorb trail into landing point over 300ms, then expand dot and fade out
        const ABSORB_DURATION = 300;
        const absorbStart = Date.now();
        const snapshot = trailBufferRef.current.map(p => ({ ...p }));
        const landingX = O_END_X + DOT_END_X_OFFSET;
        const landingY = 0;

        function absorbTrail() {
          const t = Math.min((Date.now() - absorbStart) / ABSORB_DURATION, 1);
          const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out
          const absorbed = snapshot.map(p => ({
            x: p.x + (landingX - p.x) * eased,
            y: p.y + (landingY - p.y) * eased,
            red: p.red,
          }));
          setTrailPositions(absorbed);

          if (t < 1) {
            rafRef.current = requestAnimationFrame(absorbTrail);
          } else {
            trailBufferRef.current = [];
            setTrailPositions([]);
          }
        }

        rafRef.current = requestAnimationFrame(absorbTrail);

        // Step 1: dot expands to full 'o' size (runs in parallel with absorb)
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

          {/* Trail dots */}
          {trailPositions.slice(0, -1).map((pos, i) => {
            const age = trailPositions.length - 1 - i;
            const opacity = Math.max(0, 1 - age / TRAIL_LENGTH);
            const scale = Math.max(0.1, 1 - age / TRAIL_LENGTH);
            const color = pos.red ? DOT_COLOR_RED : DOT_COLOR_WHITE;
            return (
              <View
                key={i}
                style={[styles.travellingDot, {
                  position: 'absolute',
                  right: 0,
                  transform: [
                    { translateX: pos.x + DOT_END_X_OFFSET },
                    { translateY: pos.y },
                    { scale },
                  ],
                  opacity,
                  backgroundColor: color,
                }]}
              />
            );
          })}

          {/* Travelling dot */}
          <Animated.View style={[
            styles.travellingDot,
            {
              opacity: dotOpacity,
              transform: [...travelTransform, { translateX: DOT_END_X_OFFSET }, { scale: dotScale }],
              backgroundColor: trailPositions.length > 0 && trailPositions[trailPositions.length - 1].red
                ? DOT_COLOR_RED : DOT_COLOR_WHITE,
            },
          ]} />

          {/* Settled 'o' */}
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
