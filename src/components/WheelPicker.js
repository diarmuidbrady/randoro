import React, { useEffect, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

// A scroll wheel that works the same on iOS and Android.
// The centred row is the value.

export const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5; // odd, so one row sits in the centre
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

export default function WheelPicker({ items, value, onChange, formatLabel = String, style, accessibilityLabel }) {
  const scrollRef = useRef(null);
  const selectedIndex = Math.max(0, items.indexOf(value));
  const lastIndexRef = useRef(selectedIndex);

  // Start centred on the current value.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = (e) => {
    const index = Math.min(
      items.length - 1,
      Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT))
    );
    if (index !== lastIndexRef.current) {
      lastIndexRef.current = index;
      onChange(items[index]);
    }
  };

  // Screen readers: swipe up/down to step through values.
  const step = (delta) => {
    const index = Math.min(items.length - 1, Math.max(0, selectedIndex + delta));
    if (index === selectedIndex) return;
    lastIndexRef.current = index;
    onChange(items[index]);
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  };

  return (
    <View
      style={[styles.wheel, style]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: String(items[selectedIndex]) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <View pointerEvents="none" style={styles.band} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: PAD }}
        onMomentumScrollEnd={settle}
        // Android skips onMomentumScrollEnd after a slow drag with no fling.
        onScrollEndDrag={settle}
      >
        {items.map((item, i) => (
          <View key={String(item)} style={styles.row}>
            <Text
              maxFontSizeMultiplier={1.5}
              style={[styles.label, i === selectedIndex && styles.labelSelected]}
            >
              {formatLabel(item)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    height: ITEM_HEIGHT * VISIBLE_ROWS,
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: PAD,
    height: ITEM_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  row: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 20,
    color: '#9CA3AF',
  },
  labelSelected: {
    color: '#111827',
    fontWeight: '600',
  },
});
