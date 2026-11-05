import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Tabs, Segments, Stepper, EdgeGlow } from './Controls';
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

const LEVEL_LABELS = LEVEL_KEYS.map(k => LEVELS[k].label);
const LEVEL_COLORS = Object.fromEntries(LEVEL_KEYS.map(k => [LEVELS[k].label, LEVELS[k].color]));
const keyForLabel = (label) => LEVEL_KEYS.find(k => LEVELS[k].label === label);

// The thirds are wide, so their glow reaches further in and is stronger, to
// read as clearly as the round chips.
const THIRD_GLOW_OPACITY = 0.45;
const THIRD_GLOW_DEPTH = 24;

const CHIP_WIDTH = 52;
const CHIP_GAP = 8;
const CHIP_PEEK = 0.5; // how much of the last visible chip shows when the row scrolls

// How often the beeps come. Preset is Low, Medium or High, the same for every
// round unless Advanced sets it per round or within a round. Manual is one
// Avg. wait or Calls per round, with no Advanced.
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
    <View>
      {/* Preset and Manual are branches, not options, so they're tabs. */}
      <View ref={target('intensityTabs')} collapsable={false} style={styles.tabs}>
        <Tabs labels={MODES} value={config.intensityMode} onChange={onModeChange} />
      </View>
      <View style={styles.body}>

        {!preset && (
          <ManualRows
            entry={config.manual}
            onChange={(manual) => update({ manual })}
            work={work}
            attack={attack}
          />
        )}

        {preset && config.scope === 'All' && (
          <View style={styles.row}>
            <Segments
              labels={LEVEL_LABELS}
              value={LEVELS[config.level].label}
              onChange={(label) => update({ level: keyForLabel(label) })}
              colors={LEVEL_COLORS}
            />
          </View>
        )}

        {preset && config.scope === 'PerRound' && (
          <RoundChips
            levels={fitRounds(config.roundLevels, rounds, config.level)}
            onChange={(roundLevels) => update({ roundLevels })}
          />
        )}

        {preset && config.scope === 'WithinRound' && (
          <ThirdsBar
            levels={config.thirdLevels}
            onChange={(thirdLevels) => update({ thirdLevels })}
          />
        )}

        {preset && (
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
        )}
      </View>
    </View>
  );
}

// ── Manual: Avg. wait or Calls per round, linked ────────────
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
        <Text style={styles.valueLabel}>Calls per round</Text>
        <BeepsStepper beeps={beeps} max={max} onChange={(b) => onChange(manualFromBeeps(b))} />
      </View>
    </View>
  );
}

function WaitStepper({ wait, onChange }) {
  return (
    <Stepper
      value={wait}
      display={formatWait(wait)}
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

function BeepsStepper({ beeps, max, onChange }) {
  return (
    <Stepper
      value={beeps}
      display={String(beeps)}
      min={1}
      max={max}
      onStep={(dir) => onChange(Math.min(max, Math.max(1, beeps + dir)))}
      accessibilityLabel="Calls per round"
    />
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
            <EdgeGlow color={LEVELS[key].color} radius={8.5} />
            <Text maxFontSizeMultiplier={1.5} style={styles.roundChipNumber}>{i + 1}</Text>
            <Text maxFontSizeMultiplier={1.5} style={styles.roundChipLevel}>{key}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Within round: one round split into thirds ───────────────
function ThirdsBar({ levels, onChange }) {
  return (
    <View>
      <View style={styles.thirds}>
        {levels.map((key, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <View style={styles.thirdDivider}>
                <VerticalRule color="#9CA3AF" dash="0.1 5" width={2} round />
              </View>
            )}
            <TouchableOpacity
              style={[styles.third, thirdEdge(i)]}
              onPress={() => onChange(levels.map((k, j) => (j === i ? nextLevel(k) : k)))}
              accessibilityRole="button"
              accessibilityLabel={`${THIRD_NAMES[i]} of the round: ${LEVELS[key].label}`}
              accessibilityHint="Changes its intensity"
            >
              <EdgeGlow color={LEVELS[key].color} radius={0} opacity={THIRD_GLOW_OPACITY} maxDepth={THIRD_GLOW_DEPTH} />
              <ThirdOutline color={LEVELS[key].color} index={i} />
              <Text maxFontSizeMultiplier={1.5} style={styles.thirdLevel}>{key}</Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
      <Text style={styles.thirdsHint}>Applies to every round.</Text>
    </View>
  );
}

const THIRD_NAMES = ['First third', 'Middle third', 'Last third'];
const THIRD_RADIUS = 10;
const THIRD_BORDER = 1.5;

// The outer two thirds round off the bar's ends.
function thirdEdge(i) {
  const first = i === 0;
  const last = i === THIRDS - 1;
  return {
    borderTopLeftRadius: first ? THIRD_RADIUS : 0,
    borderBottomLeftRadius: first ? THIRD_RADIUS : 0,
    borderTopRightRadius: last ? THIRD_RADIUS : 0,
    borderBottomRightRadius: last ? THIRD_RADIUS : 0,
  };
}

// Each third's edge in its own level's colour: top and bottom, plus the
// rounded end on the outer two. Drawn in SVG, since iOS leaves gaps in
// borders that differ by side on a view with rounded corners.
function ThirdOutline({ color, index }) {
  const [size, setSize] = useState(null);
  let d = '';
  if (size) {
    const { width: w, height: h } = size;
    const o = THIRD_BORDER / 2;
    const r = THIRD_RADIUS - o;
    if (index === 0) {
      d = `M ${w} ${o} H ${o + r} A ${r} ${r} 0 0 0 ${o} ${o + r} V ${h - o - r} A ${r} ${r} 0 0 0 ${o + r} ${h - o} H ${w}`;
    } else if (index === THIRDS - 1) {
      d = `M 0 ${o} H ${w - o - r} A ${r} ${r} 0 0 1 ${w - o} ${o + r} V ${h - o - r} A ${r} ${r} 0 0 1 ${w - o - r} ${h - o} H 0`;
    } else {
      d = `M 0 ${o} H ${w} M 0 ${h - o} H ${w}`;
    }
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {size && (
        <Svg width={size.width} height={size.height}>
          <Path d={d} fill="none" stroke={color} strokeWidth={THIRD_BORDER} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    paddingHorizontal: 16,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
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
    fontSize: 14,
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
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
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
    fontSize: 15,
    fontWeight: '300',
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
  },
  third: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  // Sits over the seam between two thirds.
  thirdDivider: {
    width: 4,
    marginHorizontal: -2,
    paddingVertical: 4,
    zIndex: 1,
  },
  thirdLevel: {
    fontSize: 15,
    fontWeight: '500',
    color: LEVEL_TEXT_COLOR,
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
