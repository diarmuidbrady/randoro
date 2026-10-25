import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WheelPicker from '../components/WheelPicker';
import { TUTORIAL_SEEN_KEY } from './HowItWorksScreen';
import {
  INTENSITY_MAP,
  INTENSITY_LABELS,
  COMBO_MAP,
  COMBO_LABELS,
} from '../constants/theme';
import { formatTime, parseSeconds } from '../utils/time';
import { generateWorkout, pingsForWait, maxPings, avgWaitFor } from '../utils/generator';

const DEFAULT_CONFIG = {
  warmup: {minutes: 0, seconds: 5},
  rounds: '3',
  workDuration: {minutes: 3, seconds: 0},
  restDuration: {minutes: 1, seconds: 0},
  restFirst: false,
  cooldown: {minutes: 0, seconds: 5},
  style: 'Preset',
  intensity: 'Medium',
  combo: '1-2',
  setBy: 'Wait',
  flashEnabled: true,
  vibrationEnabled: true,
};

const STYLE_LABELS = ['Preset', 'Manual', 'Simple'];
const SET_BY_LABELS = ['Wait', 'Attacks'];

const TOOLTIPS = {
  intensity: {
    title: 'Intensity',
    text: 'Controls how often audio cues fire. Higher intensity means more frequent cues.',
  },
  combo: {
    title: 'Combo #',
    text: 'Controls time given to react with punch combo. Longer combos means more time.',
  },
  manualIntensity: {
    title: 'Intensity',
    text: 'Set how often cues fire, either by the approximate wait before each cue or by the number of attacks per round. Each wait is random, so the cues stay unpredictable.',
  },
  attackLength: {
    title: 'Attack length',
    text: 'Seconds to throw your combination after each cue. This time is fixed. The random wait comes on top of it.',
  },
};

// The key in a preset map whose value is closest to target.
const nearestKey = (map, target) =>
  Object.keys(map).reduce((best, key) =>
    Math.abs(map[key] - target) < Math.abs(map[best] - target) ? key : best
  );

export default function SetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [warmup, setWarmup] = useState(DEFAULT_CONFIG.warmup);
  const [rounds, setRounds] = useState(DEFAULT_CONFIG.rounds);
  const [workDuration, setWorkDuration] = useState(DEFAULT_CONFIG.workDuration);
  const [restDuration, setRestDuration] = useState(DEFAULT_CONFIG.restDuration);
  const [restFirst, setRestFirst] = useState(DEFAULT_CONFIG.restFirst);
  const [cooldown, setCooldown] = useState(DEFAULT_CONFIG.cooldown);
  const [style, setStyle] = useState(DEFAULT_CONFIG.style);
  const [intensity, setIntensity] = useState(DEFAULT_CONFIG.intensity);
  const [combo, setCombo] = useState(DEFAULT_CONFIG.combo);
  const [setBy, setSetBy] = useState(DEFAULT_CONFIG.setBy);
  const [wait, setWait] = useState(INTENSITY_MAP[DEFAULT_CONFIG.intensity]);
  const [execTime, setExecTime] = useState(COMBO_MAP[DEFAULT_CONFIG.combo]);
  const [attacks, setAttacks] = useState(() => pingsForWait(
    parseSeconds(DEFAULT_CONFIG.workDuration), wait, execTime,
  ));
  const [flashEnabled, setFlashEnabled] = useState(DEFAULT_CONFIG.flashEnabled);
  const [vibrationEnabled, setVibrationEnabled] = useState(DEFAULT_CONFIG.vibrationEnabled);
  const [tooltipKey, setTooltipKey] = useState(null); // Used to reset tooltips
  // Preset or Manual, whichever was used last, so its values carry over to the other.
  const lastBeepStyleRef = useRef(DEFAULT_CONFIG.style);

  // The tutorial opens by itself the first time; it marks itself seen when it opens.
  // If storage fails it stays closed, and the link still works.
  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_SEEN_KEY)
      .then((seen) => { if (!seen) navigation.navigate('HowItWorks'); })
      .catch(() => {});
  }, [navigation]);

  // Manual: the attacks per round and whether they fit. Nothing is changed to
  // make them fit; the user is told and Start is blocked.
  const work = parseSeconds(workDuration);
  const maxAttacks = maxPings(work, execTime);
  const manualAttacks = setBy === 'Wait'
    ? Math.min(pingsForWait(work, wait, execTime), maxAttacks)
    : attacks;
  let manualError = null;
  if (maxAttacks < 1) {
    manualError = `A ${execTime} s attack doesn't fit a ${formatTime(work)} round.`;
  } else if (manualAttacks > maxAttacks) {
    manualError = `${attacks} attacks don't fit a ${formatTime(work)} round with ${execTime} s attacks (max ${maxAttacks}).`;
  }
  const manualHint = setBy === 'Wait'
    ? `≈ ${manualAttacks} attacks per ${formatTime(work)} round`
    : `≈ ${Math.round(avgWaitFor(work, attacks, execTime))} s wait before each attack`;

  const changeStyle = (next) => {
    const from = lastBeepStyleRef.current;
    if (next === 'Manual' && from === 'Preset') {
      const presetWait = INTENSITY_MAP[intensity];
      const presetExec = COMBO_MAP[combo];
      setWait(presetWait);
      setExecTime(presetExec);
      setAttacks(clamp(pingsForWait(work, presetWait, presetExec), ATTACKS));
    }
    if (next === 'Preset' && from === 'Manual') {
      const manualWait = setBy === 'Wait' ? wait : avgWaitFor(work, attacks, execTime);
      setIntensity(nearestKey(INTENSITY_MAP, manualWait));
      setCombo(nearestKey(COMBO_MAP, execTime));
    }
    if (next !== 'Simple') lastBeepStyleRef.current = next;
    setStyle(next);
  };

  // The value being switched to starts from the one it replaces.
  const changeSetBy = (next) => {
    if (next === setBy) return;
    if (next === 'Attacks') setAttacks(clamp(manualAttacks, ATTACKS));
    else setWait(clamp(Math.round(avgWaitFor(work, attacks, execTime)), WAITS));
    setSetBy(next);
  };

  const handleStart = () => {
    const rest = parseSeconds(restDuration);
    const r = parseInt(rounds) || 1;
    const warm = parseSeconds(warmup);
    const cool = parseSeconds(cooldown);
    const manual = style === 'Manual';
    const randomBeeps = style !== 'Simple';

    if (work < 10) {
      Alert.alert('Invalid', 'Work duration must be at least 10 seconds.');
      return;
    }
    if (manual && manualError) {
      Alert.alert("Attacks don't fit", manualError);
      return;
    }

    const workout = generateWorkout({
      warmup: warm,
      rounds: r,
      workDuration: work,
      restDuration: rest,
      restFirst,
      cooldown: cool,
      avgFrequency: INTENSITY_MAP[intensity],
      minGap: manual ? execTime : COMBO_MAP[combo],
      pingCount: manual ? manualAttacks : undefined,
      randomBeeps,
    });

    // Flash and vibration only fire on the random beeps, so Simple turns them off.
    navigation.navigate('Running', {
      workout,
      flashEnabled: randomBeeps && flashEnabled,
      vibrationEnabled: randomBeeps && vibrationEnabled,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">

        <TouchableOpacity
          style={styles.howItWorks}
          onPress={() => navigation.navigate('HowItWorks')}
          accessibilityRole="button"
        >
          <Text style={styles.howItWorksText}>How it works</Text>
        </TouchableOpacity>

        {/* ── Section 1: Round Structure ─────────────────────── */}
        <Text maxFontSizeMultiplier={3} style={styles.sectionLabel}>Round Structure</Text>
        <View style={styles.card}>

          {/* Warmup */}
          <View style={styles.secondaryRow}>
            <Text maxFontSizeMultiplier={2.5} style={styles.secondaryLabel}>Warm Up</Text>
            <DurationPicker
              label={''}
              value={warmup}
              onChange={setWarmup}
              color={'#6B7280'}
              variant={"peripheral"}
            />
          </View>

          <View style={styles.divider} />

          {/* Rounds + Work/Rest */}
          <View style={styles.roundsRow}>
            <View style={styles.roundsBlock}>
              <Text maxFontSizeMultiplier={3} numberOfLines={1} style={styles.inputLabel}>Rounds</Text>
              <RoundsPicker
                value={rounds}
                onChangeText={setRounds}
              />
            </View>

            {/* Work ↔ Rest horizontal layout */}
            <View style={styles.workRestRow}>
              {restFirst ? (
                <DurationPicker label="Rest" value={restDuration} onChange={setRestDuration} color="#22C55E" />
              ) : (
                <DurationPicker label="Work" value={workDuration} onChange={setWorkDuration} color="#EF4444" />
              )}
              <TouchableOpacity style={styles.swapButton} onPress={() => setRestFirst(v => !v)}>
                <Text maxFontSizeMultiplier={2} style={styles.swapIcon}>↔</Text>
              </TouchableOpacity>
              {restFirst ? (
                <DurationPicker label="Work" value={workDuration} onChange={setWorkDuration} color="#EF4444" 
                variant={"main"}/>
              ) : (
                <DurationPicker label="Rest" value={restDuration} onChange={setRestDuration} color="#22C55E" 
                variant={"main"}/>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Cooldown */}
          <View style={styles.secondaryRow}>
            <Text maxFontSizeMultiplier={2.5} style={styles.secondaryLabel}>Cool Down</Text>
            <DurationPicker
              style={styles.secondaryInput}
              value={cooldown}
              onChange={setCooldown}
              color={'#6B7280'}
              variant={"peripheral"}
            />
          </View>
        </View>

        {/* ── Section 2: Workout Style ────────────────────────────── */}
        <Text maxFontSizeMultiplier={3} style={styles.sectionLabel}>Workout Style</Text>
        <View style={styles.card}>
          <View style={styles.styleTabs}>
            <Segments labels={STYLE_LABELS} value={style} onChange={changeStyle} />
          </View>

          {style === 'Preset' && (
            <View style={styles.pickerContainer}>
              {/* Intensity row */}
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>Intensity</Text>
                <TouchableOpacity onPress={() => setTooltipKey('intensity')}>
                  <Text style={styles.tooltipTrigger}>?</Text>
                </TouchableOpacity>
                <Segments labels={INTENSITY_LABELS} value={intensity} onChange={setIntensity} />
              </View>

              {/* Combo row */}
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>Combo #</Text>
                <TouchableOpacity onPress={() => setTooltipKey('combo')}>
                  <Text style={styles.tooltipTrigger}>?</Text>
                </TouchableOpacity>
                <Segments labels={COMBO_LABELS} value={combo} onChange={setCombo} />
              </View>
            </View>
          )}

          {style === 'Manual' && (
            <View style={styles.pickerContainer}>
              {/* Intensity: by approximate wait or by attacks per round */}
              <View style={styles.manualSection}>
                <View style={styles.manualHeader}>
                  <Text style={styles.manualHeading}>Intensity</Text>
                  <TouchableOpacity onPress={() => setTooltipKey('manualIntensity')}>
                    <Text style={styles.tooltipTrigger}>?</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.row}>
                  <Segments labels={SET_BY_LABELS} value={setBy} onChange={changeSetBy} />
                </View>
                <View style={styles.valueRow}>
                  {setBy === 'Wait' ? (
                    <>
                      <Text style={styles.toggleLabel}>Approx. wait</Text>
                      <NumberPicker
                        items={WAITS}
                        value={wait}
                        onChange={setWait}
                        formatLabel={(n) => `${n} s`}
                        accessibilityLabel="Approximate wait"
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.toggleLabel}># Attacks</Text>
                      <NumberPicker
                        items={ATTACKS}
                        value={attacks}
                        onChange={setAttacks}
                        accessibilityLabel="Attacks per round"
                      />
                    </>
                  )}
                </View>
                {manualError
                  ? <Text style={styles.errorText}>{manualError}</Text>
                  : <Text style={styles.hintText}>{manualHint}</Text>}
              </View>

              {/* Attack length: the fixed execution time after each cue */}
              <View style={styles.manualSection}>
                <View style={styles.manualHeader}>
                  <Text style={styles.manualHeading}>Attack length</Text>
                  <TouchableOpacity onPress={() => setTooltipKey('attackLength')}>
                    <Text style={styles.tooltipTrigger}>?</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.valueRow}>
                  <Text style={styles.toggleLabel}>Execution time</Text>
                  <NumberPicker
                    items={EXEC_TIMES}
                    value={execTime}
                    onChange={setExecTime}
                    formatLabel={(n) => `${n} s`}
                    accessibilityLabel="Execution time"
                  />
                </View>
              </View>
            </View>
          )}

          {style === 'Simple' && (
            <Text style={styles.simpleNote}>
              A plain interval timer: round, rest and countdown beeps only.
            </Text>
          )}
        </View>

        {/* ── Section 3: Feedback ─────────────────────────────── */}
        {/* Flash and vibration only fire on the random beeps, so Simple greys them out */}
        <Text maxFontSizeMultiplier={3} style={styles.sectionLabel}>Feedback</Text>
        <View style={[styles.card, style === 'Simple' && styles.pickerContainerDisabled]}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Screen Flash</Text>
            <Switch
              value={flashEnabled}
              onValueChange={setFlashEnabled}
              disabled={style === 'Simple'}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Vibration</Text>
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              disabled={style === 'Simple'}
            />
          </View>
        </View>

        {/* ── Start ─────────────────────────────────────────── */}
        <TouchableOpacity style={styles.startButton} onPress={handleStart}>
          <Text style={styles.startButtonText}>ENTER</Text>
        </TouchableOpacity>
        <Modal visible={tooltipKey !== null} transparent animationType="fade">
          <TouchableOpacity style={styles.tooltipOverlay} activeOpacity={1} onPress={() => setTooltipKey(null)}>
            <View style={styles.tooltipBox}>
              <View style={styles.tooltipHeader}>
                <View style={styles.tooltipAccent} />
                <Text style={styles.tooltipHeaderText}>{TOOLTIPS[tooltipKey]?.title}</Text>
              </View>
              <Text style={styles.tooltipText}>{TOOLTIPS[tooltipKey]?.text}</Text>
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
    </View>
  );
}

const MINUTES = Array.from({ length: 61 }, (_, i) => i);
const SECONDS = Array.from({ length: 60 }, (_, i) => i);
const ROUNDS = Array.from({ length: 50 }, (_, i) => i + 1);
const WAITS = Array.from({ length: 30 }, (_, i) => i + 1);
const EXEC_TIMES = Array.from({ length: 10 }, (_, i) => i + 1);
const ATTACKS = Array.from({ length: 200 }, (_, i) => i + 1);

// Keeps a value inside a picker's range, so the wheel can show it.
const clamp = (value, items) => Math.min(items[items.length - 1], Math.max(items[0], value));

function Segments({ labels, value, onChange }) {
  return (
    <View style={styles.segmentRow}>
      {labels.map(label => (
        <TouchableOpacity
          key={label}
          style={[styles.segmentButton, value === label && styles.segmentButtonActive]}
          onPress={() => onChange(label)}
        >
          <Text
          numberOfLines={1}
          maxFontSizeMultiplier={2.5}
          style={[styles.segmentButtonText, value === label && styles.segmentButtonTextActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function NumberPicker({ items, value, onChange, formatLabel = String, accessibilityLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <View>
      <TouchableOpacity onPress={() => setIsOpen(true)}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.valueDisplay}>
          {formatLabel(value)}
        </Text>
      </TouchableOpacity>
      <Modal visible={isOpen} transparent animationType="none">
        <View style={styles.pickerModalOverlay}>
          <View style={[styles.pickerModalSheet, { paddingBottom: 24 + insets.bottom }]}>
            <TouchableOpacity style={styles.pickerModalDone} onPress={() => setIsOpen(false)}>
              <Text style={styles.pickerModalDoneText}>Done</Text>
            </TouchableOpacity>
            <WheelPicker
              items={items}
              value={value}
              onChange={onChange}
              formatLabel={formatLabel}
              accessibilityLabel={accessibilityLabel}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DurationPicker({ label, color, value, onChange, variant }) {
  const [isOpen, setIsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const display = `${String(value.minutes).padStart(2, '0')}:${String(value.seconds).padStart(2, '0')}`;

  const pickerModal = (
    <Modal visible={isOpen} transparent animationType="none">
      <View style={styles.pickerModalOverlay}>
        <View style={[styles.pickerModalSheet, { paddingBottom: 24 + insets.bottom }]}>
          <TouchableOpacity style={styles.pickerModalDone} onPress={() => setIsOpen(false)}>
            <Text style={styles.pickerModalDoneText}>Done</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row' }}>
            <WheelPicker
              items={MINUTES}
              value={value.minutes}
              onChange={(m) => onChange({ ...value, minutes: m })}
              formatLabel={(n) => `${n}m`}
              accessibilityLabel={`${label} minutes`.trim()}
              style={{ flex: 1 }}
            />
            <WheelPicker
              items={SECONDS}
              value={value.seconds}
              onChange={(s) => onChange({ ...value, seconds: s })}
              formatLabel={(n) => `${n}s`}
              accessibilityLabel={`${label} seconds`.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );

  if (variant === 'peripheral') {
    return (
      <TouchableOpacity style={styles.peripheralValue} onPress={() => setIsOpen(true)}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.durationDisplay}>{display}</Text>
        {pickerModal}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.durationBlock, { borderTopColor: color }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.durationLabel]}>{label}</Text>
      <TouchableOpacity onPress={() => setIsOpen(true)}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.durationDisplay]}>{display}</Text>
      </TouchableOpacity>
      {pickerModal}
    </View>
  );
}

function RoundsPicker({ value, onChangeText }) {
  const [isOpen, setIsOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <View>
      <TouchableOpacity onPress={() => setIsOpen(true)}>
        <Text numberOfLines={1} maxFontSizeMultiplier={2.5} style={styles.roundsDisplay}>
          {value}
        </Text>
      </TouchableOpacity>
      <Modal visible={isOpen} transparent animationType="none">
        <View style={styles.pickerModalOverlay}>
          <View style={[styles.pickerModalSheet, { paddingBottom: 24 + insets.bottom }]}>
            <TouchableOpacity style={styles.pickerModalDone} onPress={() => setIsOpen(false)}>
              <Text style={styles.pickerModalDoneText}>Done</Text>
            </TouchableOpacity>
            <WheelPicker
              items={ROUNDS}
              value={Number(value)}
              onChange={(v) => onChangeText(String(v))}
              accessibilityLabel="Rounds"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scroll: {
    padding: 16,
  },
  howItWorks: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  howItWorksText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },

  // Secondary rows (warmup/cooldown)
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    opacity: 0.5,
  },
  secondaryLabel: {
    fontSize: 15,
    color: '#374151',
    flex: 4,
  },
  secondaryInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 15,
    width: 60,
    textAlign: 'center',
    color: '#111827',
  },
  secondaryUnit: {
    fontSize: 13,
    color: '#6B7280',
    width: 44,
  },

  // Rounds row
  roundsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
    alignItems: 'center',
  },
  roundsBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0,
  },
  roundsDisplay: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    paddingVertical: 4,
  },
  inputLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },

  // Work/Rest horizontal layout
  workRestRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
  },
  durationBlock: {
    flex: 1,
    borderTopWidth: 3,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
  },
  durationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  durationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 15,
    fontWeight: '600',
    width: 52,
    textAlign: 'center',
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  durationUnit: {
    fontSize: 12,
    color: '#6B7280',
  },
  swapButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  swapIcon: {
    fontSize: 18,
    color: '#374151',
  },

  // Intensity pickers
  pickerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 20,
  },
  pickerContainerDisabled: {
    opacity: 0.35,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 64,
    flexShrink: 1,
    textAlign: 'center',
  },
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

  // Workout Style tabs
  styleTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  row: {
    flexDirection: 'row',
  },
  simpleNote: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    fontSize: 15,
    color: '#374151',
  },

  // Manual tab
  manualSection: {
    gap: 10,
  },
  manualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  manualHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  valueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  valueDisplay: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 4,
    textAlign: 'right',
    minWidth: 48,
  },
  hintText: {
    fontSize: 13,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  toggleLabel: {
    fontSize: 15,
    color: '#374151',
  },

  // Start button
  startButton: {
    marginTop: 32,
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },

  peripheralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  peripheralValue: {
    flex: 1,
  },
  durationDisplay: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 4,
    textAlign: 'right',
  },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pickerModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  pickerModalDone: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerModalDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  tooltipBox: {
    backgroundColor: '#0b0f18',
    borderRadius: 16,
    padding: 20,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  tooltipAccent: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  tooltipHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  tooltipText: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
    lineHeight: 20,
  },
  tooltipTrigger: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
