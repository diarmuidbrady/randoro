import React, { useState } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import {
  INTENSITY_MAP,
  INTENSITY_LABELS,
  COMBO_MAP,
  COMBO_LABELS,
} from '../constants/theme';
import { formatTime, parseSeconds } from '../utils/time';
import { generateWorkout } from '../utils/generator';

const DEFAULT_CONFIG = {
  warmup: {minutes: 0, seconds: 0},
  rounds: '3',
  workDuration: {minutes: 3, seconds: 0},
  restDuration: {minutes: 1, seconds: 0},
  restFirst: false,
  cooldown: {minutes: 0, seconds: 0},
  intensity: 'Medium',
  combo: '1-2',
  flashEnabled: true,
  vibrationEnabled: true,
};

export default function SetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [warmup, setWarmup] = useState(DEFAULT_CONFIG.warmup);
  const [rounds, setRounds] = useState(DEFAULT_CONFIG.rounds);
  const [workDuration, setWorkDuration] = useState(DEFAULT_CONFIG.workDuration);
  const [restDuration, setRestDuration] = useState(DEFAULT_CONFIG.restDuration);
  const [restFirst, setRestFirst] = useState(DEFAULT_CONFIG.restFirst);
  const [cooldown, setCooldown] = useState(DEFAULT_CONFIG.cooldown);
  const [intensity, setIntensity] = useState(DEFAULT_CONFIG.intensity);
  const [combo, setCombo] = useState(DEFAULT_CONFIG.combo);
  const [flashEnabled, setFlashEnabled] = useState(DEFAULT_CONFIG.flashEnabled);
  const [vibrationEnabled, setVibrationEnabled] = useState(DEFAULT_CONFIG.vibrationEnabled);
  const [tooltipKey, setTooltipKey] = useState(null); // Used to reset tooltips

  const getIntervalSettings = () => ({
    minGap: COMBO_MAP[combo],
    avgFrequency: INTENSITY_MAP[intensity],
  });

  const handleStart = () => {
    const work = parseSeconds(workDuration);
    const rest = parseSeconds(restDuration);
    const r = parseInt(rounds) || 1;
    const warm = parseSeconds(warmup);
    const cool = parseSeconds(cooldown);
    const { minGap, avgFrequency } = getIntervalSettings();

    if (work < 10) {
      Alert.alert('Invalid', 'Work duration must be at least 10 seconds.');
      return;
    }
    if (work < minGap) {
      Alert.alert('Invalid', 'Work duration must be longer than the min gap.');
      return;
    }

    const workout = generateWorkout({
      warmup: warm,
      rounds: r,
      workDuration: work,
      restDuration: rest,
      restFirst,
      cooldown: cool,
      avgFrequency,
      minGap,
    });

    navigation.navigate('Running', { workout, flashEnabled, vibrationEnabled });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">

        {/* ── Section 1: Round Structure ─────────────────────── */}
        <Text style={styles.sectionLabel}>Round Structure</Text>
        <View style={styles.card}>

          {/* Warmup */}
          <View style={styles.secondaryRow}>
            <Text style={styles.secondaryLabel}>Warm Up</Text>
            <View style={styles.secondaryInputWrap}>
              <DurationPicker
                label={''}
                value={warmup}
                onChange={setWarmup}
                color={'#6B7280'}
                variant={"peripheral"}
              />
            </View>
          </View>

          <View style={styles.divider} />

          {/* Rounds + Work/Rest */}
          <View style={styles.roundsRow}>
            <View style={styles.roundsBlock}>
              <Text style={styles.inputLabel}>Rounds</Text>
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
            <Text style={styles.secondaryLabel}>Cool Down</Text>
            <View style={styles.secondaryInputWrap}>
              <DurationPicker
                style={styles.secondaryInput}
                value={cooldown}
                onChange={setCooldown}
                color={'#6B7280'}
                variant={"peripheral"}
              />
            </View>
          </View>
        </View>

        {/* ── Section 2: Workout Style ────────────────────────────── */}
        <Text style={styles.sectionLabel}>Workout Style</Text>
        <View style={styles.card}>
            <View style={styles.pickerContainer}>
              {/* Intensity row */}
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>Intensity</Text>
                <TouchableOpacity onPress={() => setTooltipKey('intensity')}>
                  <Text style={styles.tooltipTrigger}>?</Text>
                </TouchableOpacity>
                <View style={styles.segmentRow}>
                  {INTENSITY_LABELS.map(label => (
                    <TouchableOpacity
                      key={label}
                      style={[styles.segmentButton, intensity === label && styles.segmentButtonActive]}
                      onPress={() => setIntensity(label)}
                    >
                      <Text style={[styles.segmentButtonText, intensity === label && styles.segmentButtonTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Combo row */}
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>Combo #</Text>
                <TouchableOpacity onPress={() => setTooltipKey('combo')}>
                  <Text style={styles.tooltipTrigger}>?</Text>
                </TouchableOpacity>
                <View style={styles.segmentRow}>
                  {COMBO_LABELS.map(label => (
                    <TouchableOpacity
                      key={label}
                      style={[styles.segmentButton, combo === label && styles.segmentButtonActive]}
                      onPress={() => setCombo(label)}
                    >
                      <Text style={[styles.segmentButtonText, combo === label && styles.segmentButtonTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
        </View>

        {/* ── Section 3: Feedback ─────────────────────────────── */}
        <Text style={styles.sectionLabel}>Feedback</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Screen Flash</Text>
            <Switch value={flashEnabled} onValueChange={setFlashEnabled} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Vibration</Text>
            <Switch value={vibrationEnabled} onValueChange={setVibrationEnabled} />
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
                <Text style={styles.tooltipHeaderText}>
                  {tooltipKey === 'intensity' ? 'Intensity' : 'Combo #'}
                </Text>
              </View>
              <Text style={styles.tooltipText}>
                {tooltipKey === 'intensity'
                  ? 'Controls how often audio cues fire. Higher intensity means more frequent cues.'
                  : 'Controls time given to react with punch combo. Longer combos means more time.'
                }
              </Text>
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
    </View>
  );
}

function DurationPicker({ label, color, value, onChange, variant }) {
  const [isOpen, setIsOpen] = useState(false);
  const display = `${String(value.minutes).padStart(2, '0')}:${String(value.seconds).padStart(2, '0')}`;

  const pickerModal = (
    <Modal visible={isOpen} transparent animationType="none">
      <View style={styles.pickerModalOverlay}>
        <View style={styles.pickerModalSheet}>
          <TouchableOpacity style={styles.pickerModalDone} onPress={() => setIsOpen(false)}>
            <Text style={styles.pickerModalDoneText}>Done</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row' }}>
            <Picker
              selectedValue={value.minutes}
              onValueChange={(m) => onChange({ ...value, minutes: m })}
              style={{ flex: 1 }}
            >
              {Array.from({ length: 61 }, (_, i) => i).map(n => (
                <Picker.Item key={n} label={`${n}m`} value={n} />
              ))}
            </Picker>
            <Picker
              selectedValue={value.seconds}
              onValueChange={(s) => onChange({ ...value, seconds: s })}
              style={{ flex: 1 }}
            >
              {Array.from({ length: 61 }, (_, i) => i).map(n => (
                <Picker.Item key={n} label={`${n}s`} value={n} />
              ))}
            </Picker>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (variant === 'peripheral') {
    return (
      <View style={styles.peripheralRow}>
        <Text style={styles.secondaryLabel}>{label}</Text>
        <TouchableOpacity onPress={() => setIsOpen(true)}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.durationDisplay}>{display}</Text>
        </TouchableOpacity>
        {pickerModal}
      </View>
    );
  }

  return (
    <View style={[styles.durationBlock, { borderTopColor: color }]}>
      <Text style={styles.durationLabel}>{label}</Text>
      <TouchableOpacity onPress={() => setIsOpen(true)}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.durationDisplay}>{display}</Text>
      </TouchableOpacity>
      {pickerModal}
    </View>
  );
}

function RoundsPicker({ value, onChangeText }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View>
      <TouchableOpacity onPress={() => setIsOpen(true)}>
        <Text style={styles.roundsDisplay}>{value}</Text>
      </TouchableOpacity>
      <Modal visible={isOpen} transparent animationType="none">
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalSheet}>
            <TouchableOpacity style={styles.pickerModalDone} onPress={() => setIsOpen(false)}>
              <Text style={styles.pickerModalDoneText}>Done</Text>
            </TouchableOpacity>
            <Picker
              selectedValue={Number(value)}
              onValueChange={(v) => onChangeText(String(v))}
              style={{ width: '100%' }}
            >
              {Array.from({ length: 50 }, (_, i) => i + 1).map(n => (
                <Picker.Item key={n} label={`${n}`} value={n} />
              ))}
            </Picker>
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
    flexShrink: 1,
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
    gap: 6,
    minWidth: 180,
  },
  segmentButton: {
    flexShrink: 1,
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
    flexShrink: 1,
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
  durationDisplay: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 4,
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
