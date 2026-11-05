import React, { useId, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { Tabs, Segments, Stepper, RepeatButton } from './Controls';
import { Chevron, VerticalRule } from './CallShape';
import { LEVELS, LEVEL_KEYS, LEVEL_TEXT_COLOR } from '../constants/theme';
import {
  PATTERNS,
  WAIT_MIN,
  WAIT_MAX,
  WAIT_STEP,
  THIRDS,
  fitRounds,
  nextLevel,
  nearestLevel,
  clampWait,
  roundToStep,
  formatWait,
  resolveManual,
  manualFromWait,
  manualFromBeeps,
} from '../utils/intensity';

const MODES = ['Preset', 'Manual'];
const SCOPES = { PerRound: 'Per round', WithinRound: 'Within round' };
const SCOPE_BY_LABEL = { 'Per round': 'PerRound', 'Within round': 'WithinRound' };

const GLOW_CLEAR = 0.3;    // the glow is clear out to this share of the way to the edge...
const GLOW_OPACITY = 0.75; // ...and this strong at the edge

const CHIP_WIDTH = 52;
const CHIP_GAP = 8;
const CHIP_PEEK = 0.5; // how much of the last visible chip shows when the row scrolls

// How often the beeps come: Preset levels or Manual numbers, the same for
// every round unless Advanced sets them per round or within a round.
export default function IntensitySection({ config, update, rounds, work, attack, onModeChange, onTip, target }) {
  const [advancedOpen, setAdvancedOpen] = useState(config.scope !== 'All');
  const preset = config.intensityMode === 'Preset';

  const toggleAdvanced = () => {
    // Closing Advanced goes back to the same intensity for every round.
    if (advancedOpen) update({ scope: 'All' });
    else onTip('advanced');
    setAdvancedOpen(!advancedOpen);
  };

  const chooseScope = (label) => {
    const scope = SCOPE_BY_LABEL[label];
    // Tapping the chosen option again turns it off.
    update({ scope: config.scope === scope ? 'All' : scope });
    if (config.scope !== scope) onTip(scope);
  };

  return (
    <View style={styles.card}>
      <View ref={target('intensityTabs')} collapsable={false}>
        <Tabs labels={MODES} value={config.intensityMode} onChange={onModeChange} />
      </View>

      <View style={styles.body}>
        {config.scope === 'All' && (preset ? (
          <LevelButtons value={config.level} onChange={(level) => update({ level })} />
        ) : (
          <ManualRows
            entry={config.manual}
            onChange={(manual) => update({ manual })}
            work={work}
            attack={attack}
          />
        ))}

        {config.scope === 'PerRound' && (preset ? (
          <RoundChips
            levels={fitRounds(config.roundLevels, rounds, config.level)}
            onChange={(roundLevels) => update({ roundLevels })}
          />
        ) : (
          <RoundTable
            entries={fitRounds(config.roundManual, rounds, config.manual)}
            onChange={(roundManual) => update({ roundManual })}
            work={work}
            attack={attack}
          />
        ))}

        {config.scope === 'WithinRound' && (
          <ThirdsBar
            preset={preset}
            levels={config.thirdLevels}
            waits={config.thirdWaits}
            onChangeLevels={(thirdLevels) => update({ thirdLevels })}
            onChangeWaits={(thirdWaits) => update({ thirdWaits })}
          />
        )}

        <View ref={target('advanced')} collapsable={false} style={styles.advancedBlock}>
          <TouchableOpacity
            onPress={toggleAdvanced}
            style={styles.advancedLink}
            accessibilityRole="button"
            accessibilityState={{ expanded: advancedOpen }}
            hitSlop={8}
          >
            <Text style={styles.advancedText}>Advanced</Text>
            <Chevron direction={advancedOpen ? 'up' : 'down'} size={12} />
          </TouchableOpacity>
          {advancedOpen && (
            <View style={styles.row}>
              <Segments
                labels={Object.values(SCOPES)}
                value={SCOPES[config.scope]}
                onChange={chooseScope}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Manual: Avg. wait or Beeps per round, linked ────────────
function ManualRows({ entry, onChange, work, attack }) {
  const { wait, beeps, max } = resolveManual(entry, work, attack);
  return (
    <View style={styles.manual}>
      <View style={styles.valueRow}>
        <Text style={styles.valueLabel}>Avg. wait</Text>
        <WaitStepper wait={wait} onChange={(w) => onChange(manualFromWait(w))} />
      </View>
      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orLine} />
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.valueLabel}>Beeps per round</Text>
        <BeepsStepper beeps={beeps} max={max} onChange={(b) => onChange(manualFromBeeps(b))} />
      </View>
    </View>
  );
}

function WaitStepper({ wait, onChange, compact }) {
  return (
    <Stepper
      compact={compact}
      value={wait}
      display={compact ? wait.toFixed(1) : formatWait(wait)}
      min={WAIT_MIN}
      max={WAIT_MAX}
      onStep={(dir) => onChange(clampWait(roundToStep(wait + dir * WAIT_STEP)))}
      parse={(text) => {
        const n = parseFloat(String(text).replace(',', '.'));
        return Number.isFinite(n) ? clampWait(Math.round(n * 10) / 10) : null;
      }}
      onType={onChange}
      accessibilityLabel="Average wait in seconds"
    />
  );
}

function BeepsStepper({ beeps, max, onChange, compact }) {
  return (
    <Stepper
      compact={compact}
      value={beeps}
      display={String(beeps)}
      min={1}
      max={max}
      onStep={(dir) => onChange(Math.min(max, Math.max(1, beeps + dir)))}
      accessibilityLabel="Beeps per round"
    />
  );
}

function RoundTable({ entries, onChange, work, attack }) {
  const set = (i, entry) => onChange(entries.map((e, j) => (j === i ? entry : e)));
  return (
    <View>
      <View style={styles.tableHeader}>
        <Text numberOfLines={1} style={[styles.tableHeading, styles.tableRound]}>Rd</Text>
        <Text style={[styles.tableHeading, styles.tableCell]}>Avg. wait (s)</Text>
        <Text style={[styles.tableHeading, styles.tableCell]}>Beeps</Text>
      </View>
      <ScrollView style={styles.tableScroll} nestedScrollEnabled>
        {entries.map((entry, i) => {
          const { wait, beeps, max } = resolveManual(entry, work, attack);
          return (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableRoundText, styles.tableRound]}>{i + 1}</Text>
              <View style={styles.tableCell}>
                <WaitStepper compact wait={wait} onChange={(w) => set(i, manualFromWait(w))} />
              </View>
              <View style={styles.tableCell}>
                <BeepsStepper compact beeps={beeps} max={max} onChange={(b) => set(i, manualFromBeeps(b))} />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Preset per round: a chip per round ──────────────────────
function RoundChips({ levels, onChange }) {
  const [width, setWidth] = useState(0);
  const n = levels.length;
  const patterns = PATTERNS.filter(p => n >= p.minRounds);

  // When the chips overflow, size them so the last visible one is cut off at
  // the edge, which shows the row scrolls.
  let chipWidth = CHIP_WIDTH;
  if (width > 0 && n * (CHIP_WIDTH + CHIP_GAP) - CHIP_GAP > width) {
    const whole = Math.max(1, Math.floor((width - CHIP_PEEK * CHIP_WIDTH) / (CHIP_WIDTH + CHIP_GAP)));
    chipWidth = (width - whole * CHIP_GAP) / (whole + CHIP_PEEK);
  }

  return (
    <View style={styles.perRound}>
      {patterns.length > 0 && (
        <View style={styles.patterns}>
          {patterns.map(p => (
            <TouchableOpacity
              key={p.name}
              style={styles.patternButton}
              onPress={() => onChange(p.levels(n))}
              accessibilityRole="button"
              accessibilityHint="Sets every round's intensity"
            >
              <Text numberOfLines={1} maxFontSizeMultiplier={2} style={styles.patternText}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        contentContainerStyle={styles.chipRow}
      >
        {levels.map((key, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.roundChip, { width: chipWidth, borderColor: LEVELS[key].color }]}
            onPress={() => onChange(levels.map((k, j) => (j === i ? nextLevel(k) : k)))}
            accessibilityRole="button"
            accessibilityLabel={`Round ${i + 1}: ${LEVELS[key].label}`}
            accessibilityHint="Changes this round's intensity"
          >
            <Glow color={LEVELS[key].color} radius={8.5} />
            <Text maxFontSizeMultiplier={1.5} style={styles.roundChipNumber}>{i + 1}</Text>
            <Text maxFontSizeMultiplier={1.5} style={styles.roundChipLevel}>{key}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Within round: one round split into thirds ───────────────
function ThirdsBar({ preset, levels, waits, onChangeLevels, onChangeWaits }) {
  const setWait = (i, wait) => onChangeWaits(waits.map((w, j) => (j === i ? wait : w)));
  return (
    <View>
      <View style={styles.thirds}>
        {Array.from({ length: THIRDS }, (_, i) => {
          const key = preset ? levels[i] : nearestLevel(waits[i]);
          const divider = i > 0 && (
            <View style={styles.thirdDivider}>
              <VerticalRule color="#FFFFFF" dash="0.1 6" width={3} round />
            </View>
          );
          if (preset) {
            return (
              <React.Fragment key={i}>
                {divider}
                <TouchableOpacity
                  style={styles.third}
                  onPress={() => onChangeLevels(levels.map((k, j) => (j === i ? nextLevel(k) : k)))}
                  accessibilityRole="button"
                  accessibilityLabel={`${THIRD_NAMES[i]} of the round: ${LEVELS[key].label}`}
                  accessibilityHint="Changes its intensity"
                >
                  <Glow color={LEVELS[key].color} />
                  <Text maxFontSizeMultiplier={1.5} style={styles.thirdLevel}>{key}</Text>
                </TouchableOpacity>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={i}>
              {divider}
              <View
                style={[styles.third, styles.thirdManual]}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={`${THIRD_NAMES[i]} of the round, average wait`}
                accessibilityValue={{ text: formatWait(waits[i]) }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(e) => setWait(i, clampWait(waits[i] + (e.nativeEvent.actionName === 'increment' ? WAIT_STEP : -WAIT_STEP)))}
              >
                <Glow color={LEVELS[key].color} />
                <RepeatButton
                  label={<Chevron direction="up" size={16} color={LEVEL_TEXT_COLOR} />}
                  accessibilityLabel="Longer wait"
                  style={styles.chevron}
                  disabled={waits[i] >= WAIT_MAX}
                  onStep={() => setWait(i, clampWait(roundToStep(waits[i] + WAIT_STEP)))}
                />
                <Text maxFontSizeMultiplier={1.5} style={styles.thirdWait}>{formatWait(waits[i])}</Text>
                <RepeatButton
                  label={<Chevron direction="down" size={16} color={LEVEL_TEXT_COLOR} />}
                  accessibilityLabel="Shorter wait"
                  style={styles.chevron}
                  disabled={waits[i] <= WAIT_MIN}
                  onStep={() => setWait(i, clampWait(roundToStep(waits[i] - WAIT_STEP)))}
                />
              </View>
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.thirdsHint}>Applies to every round.</Text>
    </View>
  );
}

const THIRD_NAMES = ['First third', 'Middle third', 'Last third'];

// The level's colour glows in from the edges and fades to clear in the middle.
// It's sized from its layout: percentage sizes don't fill the parent reliably.
function Glow({ color, radius = 0 }) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {size && (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <RadialGradient
              id={id}
              gradientUnits="userSpaceOnUse"
              cx={size.width / 2}
              cy={size.height / 2}
              rx={size.width / 2}
              ry={size.height / 2}
              fx={size.width / 2}
              fy={size.height / 2}
            >
              <Stop offset={GLOW_CLEAR} stopColor={color} stopOpacity={0} />
              <Stop offset={1} stopColor={color} stopOpacity={GLOW_OPACITY} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} rx={radius} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}

// Low, Medium, High. The chosen one glows in its colour with a matching edge.
function LevelButtons({ value, onChange }) {
  return (
    <View style={styles.levelRow}>
      {LEVEL_KEYS.map((key) => {
        const active = key === value;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.levelButton, active && { borderColor: LEVELS[key].color }]}
            onPress={() => onChange(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {active && <Glow color={LEVELS[key].color} radius={7} />}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={2.5}
              style={[styles.levelText, active && styles.levelTextActive]}
            >
              {LEVELS[key].label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 18,
  },
  row: {
    flexDirection: 'row',
  },
  levelRow: {
    flexDirection: 'row',
    gap: 6,
  },
  levelButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    overflow: 'hidden',
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  levelTextActive: {
    color: LEVEL_TEXT_COLOR,
  },

  // Manual
  manual: {
    gap: 6,
  },
  valueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  valueLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
    flexShrink: 1,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  orText: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Per-round table
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableScroll: {
    maxHeight: 320,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableRound: {
    width: 36,
  },
  tableRoundText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  tableCell: {
    flex: 1,
    alignItems: 'center',
  },

  // Per-round chips
  perRound: {
    gap: 12,
  },
  patterns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  patternButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
  },
  patternText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  chipRow: {
    gap: CHIP_GAP,
  },
  roundChip: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 8,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  roundChipNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: LEVEL_TEXT_COLOR,
  },
  roundChipLevel: {
    fontSize: 13,
    fontWeight: '600',
    color: LEVEL_TEXT_COLOR,
    opacity: 0.8,
  },

  // Thirds bar
  thirds: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  third: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  thirdManual: {
    paddingVertical: 2,
  },
  // Sits over the seam between two thirds.
  thirdDivider: {
    width: 4,
    marginHorizontal: -2,
    paddingVertical: 4,
    zIndex: 1,
  },
  thirdLevel: {
    fontSize: 18,
    fontWeight: '700',
    color: LEVEL_TEXT_COLOR,
  },
  thirdWait: {
    fontSize: 15,
    fontWeight: '700',
    color: LEVEL_TEXT_COLOR,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    width: '100%',
    height: 28,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  thirdsHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#6B7280',
  },

  // Advanced
  advancedBlock: {
    gap: 12,
  },
  advancedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  advancedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textDecorationLine: 'underline',
  },
});
