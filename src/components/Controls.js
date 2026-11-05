import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

const TAB_STRIP_COLOR = '#E5E7EB';
const TAB_RADIUS = 10;

const REPEAT_DELAY_MS = 400;  // hold this long before a stepper starts repeating
const REPEAT_START_MS = 150;  // first repeat interval...
const REPEAT_MIN_MS = 40;     // ...speeding up to this
const REPEAT_SPEEDUP = 0.85;

// Calls onStep on press, then again and faster while held.
export function useRepeat(onStep) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const timerRef = useRef(null);

  const stop = () => clearTimeout(timerRef.current);
  useEffect(() => stop, []);

  const start = () => {
    stop();
    stepRef.current();
    let interval = REPEAT_START_MS;
    const repeat = () => {
      stepRef.current();
      interval = Math.max(REPEAT_MIN_MS, interval * REPEAT_SPEEDUP);
      timerRef.current = setTimeout(repeat, interval);
    };
    timerRef.current = setTimeout(repeat, REPEAT_DELAY_MS);
  };

  return { onPressIn: start, onPressOut: stop };
}

export function RepeatButton({ onStep, label, accessibilityLabel, style, textStyle, disabled }) {
  const repeat = useRepeat(onStep);
  return (
    <TouchableOpacity
      {...(disabled ? {} : repeat)}
      disabled={disabled}
      style={[styles.stepButton, disabled && styles.disabled, style]}
      accessibilityRole="button"
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

// A row of buttons, one chosen. `colors` fills the chosen one per label.
export function Segments({ labels, value, onChange, colors, textColor }) {
  return (
    <View style={styles.segmentRow}>
      {labels.map(label => {
        const active = value === label;
        const fill = active && colors?.[label];
        return (
          <TouchableOpacity
            key={label}
            style={[
              styles.segmentButton,
              active && styles.segmentButtonActive,
              fill && { backgroundColor: fill, borderColor: fill },
            ]}
            onPress={() => onChange(label)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.segmentButtonText,
                active && styles.segmentButtonTextActive,
                fill && textColor && { color: textColor },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Browser-style tabs: the chosen tab is the card's colour and runs into the
// body below, with curved corners where it meets the body.
export function Tabs({ labels, value, onChange }) {
  return (
    <View style={styles.tabStrip} accessibilityRole="tablist">
      {labels.map((label, i) => {
        const active = value === label;
        // Dividers only sit between two unchosen tabs.
        const divider = i > 0 && !active && labels[i - 1] !== value;
        return (
          <React.Fragment key={label}>
            {i > 0 && <View style={[styles.tabDivider, !divider && styles.tabDividerHidden]} />}
            <TouchableOpacity
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => onChange(label)}
              activeOpacity={active ? 1 : 0.6}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              {active && (
                <>
                  <View style={[styles.tabFlare, styles.tabFlareLeft]}>
                    <View style={[styles.tabFlareCut, styles.tabFlareCutLeft]} />
                  </View>
                  <View style={[styles.tabFlare, styles.tabFlareRight]}>
                    <View style={[styles.tabFlareCut, styles.tabFlareCutRight]} />
                  </View>
                </>
              )}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.tabText, active && styles.tabTextActive]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// A heading with an optional help button above its controls.
export function Field({ title, onHelp, children, style }) {
  return (
    <View style={[styles.field, style]}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldHeading}>{title}</Text>
        {onHelp && (
          <TouchableOpacity onPress={onHelp} accessibilityRole="button" accessibilityLabel={`About ${title}`}>
            <Text style={styles.helpTrigger}>?</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
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
    backgroundColor: '#F3F4F6',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // Segments
  segmentRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    minWidth: 180,
  },
  segmentButton: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  segmentButtonActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  segmentButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
  },

  // Tabs
  tabStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: TAB_STRIP_COLOR,
    paddingHorizontal: TAB_RADIUS,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopLeftRadius: TAB_RADIUS,
    borderTopRightRadius: TAB_RADIUS,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#111827',
  },
  tabDivider: {
    width: 1,
    marginVertical: 10,
    backgroundColor: '#C4C8CE',
  },
  tabDividerHidden: {
    backgroundColor: 'transparent',
  },
  // A white square with a strip-coloured quarter circle on top, at each
  // bottom corner of the chosen tab, makes the curve into the body.
  tabFlare: {
    position: 'absolute',
    bottom: 0,
    width: TAB_RADIUS,
    height: TAB_RADIUS,
    backgroundColor: '#FFFFFF',
  },
  tabFlareLeft: {
    left: -TAB_RADIUS,
  },
  tabFlareRight: {
    right: -TAB_RADIUS,
  },
  tabFlareCut: {
    flex: 1,
    backgroundColor: TAB_STRIP_COLOR,
  },
  tabFlareCutLeft: {
    borderBottomRightRadius: TAB_RADIUS,
  },
  tabFlareCutRight: {
    borderBottomLeftRadius: TAB_RADIUS,
  },

  // Field
  field: {
    gap: 10,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  helpTrigger: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
