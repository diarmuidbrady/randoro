import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Segments } from './Controls';

// Set once the tour has run. SetupScreen starts it automatically until then.
export const TOUR_SEEN_KEY = 'setupTourSeen';
// The first-time tips already shown, as a JSON list of tip keys.
export const TIPS_SEEN_KEY = 'tipsSeen';

export const TOUR_PATHS = ['Simple', 'Advanced'];
const PATH_COLORS = { Simple: '#FFFFFF', Advanced: '#FFFFFF' };

// The main steps, each with a detail branch the Advanced path also visits.
// A target is the key a section registers with SetupScreen's target(); a list
// falls back to the next key when one isn't on screen.
const MAIN_STEPS = [
  {
    target: 'structure',
    caption: "It's an interval timer: set your rounds, work and rest here.",
  },
  {
    target: 'beepsToggle',
    caption: 'Turn Random Beeps on for reaction training, or off for a plain timer.',
  },
  {
    target: 'focus',
    caption: 'This is your combo: what you throw on each beep.',
    detail: [
      { target: 'speaker', caption: 'Tap the speaker to hear the beep.' },
      { target: 'comboSide', caption: 'Tap here to change the combo length: 1–2, 3–4 or 5–6+ punches.' },
      { target: 'comboSide', caption: 'Hold it to type your own combo, like jab, cross, slip.' },
      { target: ['addCall', 'calls'], caption: 'Tap + to add calls A, B and C, each with its own voice and combo.' },
      { target: 'betweenBeeps', caption: 'Between beeps is what you work on while you wait. It shows under the timer.' },
    ],
  },
  {
    target: 'intensity',
    caption: 'This is how hard: Low, Medium or High sets how often the beeps come.',
    detail: [
      { target: 'intensityTabs', caption: 'Manual sets the Avg. wait or the Beeps per round instead.' },
      { target: 'advanced', caption: 'Advanced sets the intensity per round, or for each third of a round.' },
    ],
  },
  {
    target: 'start',
    caption: "When you're ready, hit Enter. Attack on the beep, then wait for the next one.",
  },
];

// The steps for a path. Each remembers its main step, so switching path
// mid-tour lands on the same section.
export function tourSteps(path) {
  return MAIN_STEPS.flatMap((step, main) => [
    { ...step, main },
    ...(path === 'Advanced' ? (step.detail ?? []).map(d => ({ ...d, main })) : []),
  ]);
}

export function switchTourPath(tour, path) {
  const { main } = tourSteps(tour.path)[tour.index];
  return { path, index: tourSteps(path).findIndex(s => s.main === main) };
}

// One-off tips, shown the first time the user opens a feature.
export const TIPS = {
  calls: {
    target: 'calls',
    caption: 'Each call has its own voice: A, B or C. Swipe a call left to remove it.',
  },
  manual: {
    target: 'intensity',
    caption: 'Set the Avg. wait or the Beeps per round: change one and the other follows. Advanced has per-round and within-round intensity.',
  },
  advanced: {
    target: 'advanced',
    caption: 'Per round sets each round on its own. Within round varies the intensity across a round.',
  },
  PerRound: {
    target: 'intensity',
    caption: 'Set each round on its own. In Preset, tap a round to change its level, or pick a pattern.',
  },
  WithinRound: {
    target: 'intensity',
    caption: 'Each third of the round has its own intensity, the same in every round.',
  },
};

const HOLE_PAD = 6;
const DIM = 'rgba(0,0,0,0.65)';

// Dims the screen around a spotlit rect, with a caption card beside it.
// Tapping anywhere outside the card's buttons calls onNext. While the rect is
// being measured it's null and only the dim shows; { none: true } means the
// target isn't on screen, and the card shows in the middle.
export function Spotlight({ rect, screen, caption, onNext, children }) {
  const [cardHeight, setCardHeight] = useState(0);
  if (!rect) {
    return <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} onPress={onNext} />;
  }
  if (rect.none) {
    return (
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} onPress={onNext} />
        <Pressable
          style={[styles.card, { top: (screen.height - cardHeight) / 2 }]}
          onPress={onNext}
          accessible={false}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <Text style={styles.caption} accessibilityLiveRegion="polite">{caption}</Text>
          {children}
        </Pressable>
      </View>
    );
  }

  const hole = {
    x: Math.max(0, rect.x - HOLE_PAD),
    y: Math.max(0, rect.y - HOLE_PAD),
    width: Math.min(screen.width, rect.width + HOLE_PAD * 2),
    height: rect.height + HOLE_PAD * 2,
  };
  const below = screen.height - (hole.y + hole.height);
  // The card goes on whichever side has more room, and over the hole if neither fits it.
  const placeBelow = below >= hole.y;
  let cardTop = placeBelow ? hole.y + hole.height + 12 : hole.y - 12 - cardHeight;
  cardTop = Math.min(Math.max(screen.top + 12, cardTop), screen.height - screen.bottom - cardHeight - 12);

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={onNext} accessibilityRole="button" accessibilityLabel="Continue">
        <View style={[styles.dim, { left: 0, right: 0, top: 0, height: hole.y }]} />
        <View style={[styles.dim, { left: 0, right: 0, top: hole.y + hole.height, bottom: 0 }]} />
        <View style={[styles.dim, { left: 0, width: hole.x, top: hole.y, height: hole.height }]} />
        <View style={[styles.dim, { left: hole.x + hole.width, right: 0, top: hole.y, height: hole.height }]} />
        <View pointerEvents="none" style={[styles.ring, { left: hole.x, top: hole.y, width: hole.width, height: hole.height }]} />
      </Pressable>
      <Pressable
        style={[styles.card, { top: cardTop }]}
        onPress={onNext}
        accessible={false}
        onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
      >
        <Text style={styles.caption} accessibilityLiveRegion="polite">{caption}</Text>
        {children}
      </Pressable>
    </View>
  );
}

// The tour's caption card controls: path choice, back, skip, and next.
export function TourControls({ path, onPath, index, count, onBack, onSkip, onNext }) {
  const last = index === count - 1;
  return (
    <View style={styles.controls}>
      <View style={styles.pathRow}>
        <Segments labels={TOUR_PATHS} value={path} onChange={onPath} colors={PATH_COLORS} textColor="#111827" />
      </View>
      <View style={styles.buttonRow}>
        {last ? <View /> : (
          <TouchableOpacity onPress={onSkip} hitSlop={8} accessibilityRole="button">
            <Text style={styles.linkText}>Skip</Text>
          </TouchableOpacity>
        )}
        <View style={styles.navButtons}>
          {index > 0 && (
            <TouchableOpacity onPress={onBack} style={styles.secondaryButton} accessibilityRole="button">
              <Text style={styles.secondaryText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onNext} style={styles.primaryButton} accessibilityRole="button">
            <Text style={styles.primaryText}>{last ? 'Done' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.stepText}>{index + 1} of {count}</Text>
    </View>
  );
}

export function TipControls({ onDone }) {
  return (
    <View style={[styles.buttonRow, styles.tipRow]}>
      <TouchableOpacity onPress={onDone} style={styles.primaryButton} accessibilityRole="button">
        <Text style={styles.primaryText}>Got it</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: DIM,
  },
  ring: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#0b0f18',
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  caption: {
    fontSize: 16,
    lineHeight: 22,
    color: '#FFFFFF',
  },
  controls: {
    gap: 12,
  },
  pathRow: {
    flexDirection: 'row',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tipRow: {
    justifyContent: 'flex-end',
  },
  navButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#4B5563',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stepText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});
