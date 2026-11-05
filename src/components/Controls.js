import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, PixelRatio } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { UNSELECTED_FILL } from '../constants/theme';

const SEGMENT_RADIUS = 10;
const SEGMENT_BORDER = 1.5;
export const SELECTED_COLOR = '#111827';

// Edge glow: colour runs in from the border, parallel to it, and fades to clear.
const GLOW_DEPTH = 0.3;      // how far in it reaches, as a share of the shorter side...
const GLOW_DEPTH_MAX = 14;   // ...up to this many points
const GLOW_OPACITY = 0.25;   // at the edge; the colour keeps its hue and only fades
const HAIRLINE = 1 / PixelRatio.get(); // one ring per device pixel, so the fade is smooth

const REPEAT_DELAY_MS = 400;  // hold this long before a stepper starts repeating
const REPEAT_START_MS = 150;  // first repeat interval...
const REPEAT_MIN_MS = 40;     // ...speeding up to this
const REPEAT_SPEEDUP = 0.85;

// Calls onStep on press, then again and faster while held. Repeating stops
// when the value reaches its limit (disabled), and the press handlers stay
// attached so the release is always heard.
export function useRepeat(onStep, disabled) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const timerRef = useRef(null);

  const stop = () => clearTimeout(timerRef.current);
  useEffect(() => stop, []);
  useEffect(() => { if (disabled) stop(); }, [disabled]);

  const start = () => {
    stop();
    if (disabledRef.current) return;
    stepRef.current();
    let interval = REPEAT_START_MS;
    const repeat = () => {
      if (disabledRef.current) return;
      stepRef.current();
      interval = Math.max(REPEAT_MIN_MS, interval * REPEAT_SPEEDUP);
      timerRef.current = setTimeout(repeat, interval);
    };
    timerRef.current = setTimeout(repeat, REPEAT_DELAY_MS);
  };

  return { onPressIn: start, onPressOut: stop };
}

export function RepeatButton({ onStep, label, accessibilityLabel, style, textStyle, disabled }) {
  const repeat = useRepeat(onStep, disabled);
  // Not the touchable's own `disabled`: switching it mid-hold drops the release.
  return (
    <TouchableOpacity
      {...repeat}
      activeOpacity={disabled ? 1 : 0.2}
      style={[styles.stepButton, disabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
    >
      {typeof label === 'string'
        ? <Text maxFontSizeMultiplier={2} style={[styles.stepButtonText, textStyle]}>{label}</Text>
        : label}
    </TouchableOpacity>
  );
}

// − value +. With `parse`, tapping the value types an exact one on a decimal keypad.
export function Stepper({ value, display, onStep, min, max, parse, onType, accessibilityLabel }) {
  const [draft, setDraft] = useState(null);

  const commit = () => {
    const typed = parse?.(draft);
    if (typed != null) onType(typed);
    setDraft(null);
  };

  return (
    <View
      style={styles.stepper}
      accessible={!parse}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: display }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <RepeatButton label="−" onStep={() => onStep(-1)} disabled={value <= min} accessibilityLabel={`Decrease ${accessibilityLabel}`} />
      {parse ? (
        <TextInput
          style={styles.stepValue}
          value={draft ?? display}
          onFocus={() => setDraft('')}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          placeholder={display}
          placeholderTextColor="#9CA3AF"
          maxFontSizeMultiplier={2}
          accessibilityLabel={accessibilityLabel}
        />
      ) : (
        <Text numberOfLines={1} maxFontSizeMultiplier={2} style={styles.stepValue}>{display}</Text>
      )}
      <RepeatButton label="+" onStep={() => onStep(1)} disabled={value >= max} accessibilityLabel={`Increase ${accessibilityLabel}`} />
    </View>
  );
}

// A soft glow inside a rounded box, running parallel to its border. Drawn as
// rings stepping in a pixel at a time, each fainter, so it follows the corners.
// Each ring is two pixels wide and half strength, so neighbours overlap and no
// seams show at the corners.
// `radius` is the box's inner corner radius. Sized from its layout, since
// percentage sizes don't fill the parent reliably.
export function EdgeGlow({ color, radius = SEGMENT_RADIUS - SEGMENT_BORDER, opacity = GLOW_OPACITY, maxDepth = GLOW_DEPTH_MAX }) {
  const [size, setSize] = useState(null);
  const depth = size ? Math.min(maxDepth, Math.min(size.width, size.height) * GLOW_DEPTH) : 0;
  const rings = Math.round(depth / HAIRLINE);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {size && (
        <Svg width={size.width} height={size.height}>
          {Array.from({ length: rings }, (_, i) => {
            const inset = (i + 0.5) * HAIRLINE;
            const fade = 1 - i / rings;
            return (
              <Rect
                key={i}
                x={inset}
                y={inset}
                width={Math.max(0, size.width - 2 * inset)}
                height={Math.max(0, size.height - 2 * inset)}
                rx={Math.max(0, radius - inset)}
                fill="none"
                stroke={color}
                strokeWidth={HAIRLINE * 2}
                strokeOpacity={(opacity * fade * fade) / 2}
              />
            );
          })}
        </Svg>
      )}
    </View>
  );
}

// A row of buttons, one chosen. The others sit in a light charcoal fill and
// the chosen one turns white. A label given a colour in `colors` also takes a
// border and edge glow in it. `dark` is for dark cards.
export function Segments({ labels, value, onChange, colors, dark, renderLabel = String }) {
  return (
    <View style={styles.segmentRow}>
      {labels.map(label => {
        const active = value === label;
        const color = colors?.[label];
        return (
          <TouchableOpacity
            key={label}
            style={[
              styles.segmentButton,
              dark && styles.segmentButtonDark,
              active && styles.segmentButtonActive,
              active && color && { borderColor: color },
            ]}
            onPress={() => onChange(label)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {active && color && <EdgeGlow color={color} />}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={2.5}
              style={[styles.segmentText, dark && styles.segmentTextDark, active && styles.segmentTextActive]}
            >
              {renderLabel(label)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Tabs for branches (Preset / Manual): the chosen one is dark with a bar
// under it, on the same surface as its body.
export function Tabs({ labels, value, onChange }) {
  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      {labels.map(label => {
        const active = value === label;
        return (
          <TouchableOpacity
            key={label}
            style={styles.tab}
            onPress={() => onChange(label)}
            activeOpacity={active ? 1 : 0.6}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text numberOfLines={1} maxFontSizeMultiplier={2} style={[styles.tabText, active && styles.tabTextActive]}>
              {label}
            </Text>
            <View style={[styles.tabLine, active && styles.tabLineActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.3,
  },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#111827',
  },
  stepValue: {
    minWidth: 64,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 16,
    fontWeight: '300',
    color: '#111827',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // Segments
  segmentRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 180,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: SEGMENT_RADIUS,
    borderWidth: SEGMENT_BORDER,
    borderColor: 'transparent',
    backgroundColor: UNSELECTED_FILL,
    alignItems: 'center',
    overflow: 'hidden',
  },
  segmentButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  segmentButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#9CA3AF',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },
  segmentTextDark: {
    color: '#9CA3AF',
  },
  segmentTextActive: {
    fontWeight: '600',
    color: SELECTED_COLOR,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    paddingBottom: 10,
  },
  tabTextActive: {
    fontWeight: '600',
    color: SELECTED_COLOR,
  },
  // Sits over the bar's bottom line.
  tabLine: {
    alignSelf: 'stretch',
    height: 2,
    marginBottom: -1,
  },
  tabLineActive: {
    backgroundColor: SELECTED_COLOR,
  },
});
