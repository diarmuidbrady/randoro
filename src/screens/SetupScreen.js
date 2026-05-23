import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
  SOUND_OPTIONS,
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
  combo: 'Combination',
  isCustom: false,
  customMinGap: '2.5',
  customAvgFrequency: '5',
  soundChoice: 'ping',
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
  const [isCustom, setIsCustom] = useState(DEFAULT_CONFIG.isCustom);
  const [customMinGap, setCustomMinGap] = useState(DEFAULT_CONFIG.customMinGap);
  const [customAvgFrequency, setCustomAvgFrequency] = useState(DEFAULT_CONFIG.customAvgFrequency);
  const [soundChoice, setSoundChoice] = useState(DEFAULT_CONFIG.soundChoice);
  const [flashEnabled, setFlashEnabled] = useState(DEFAULT_CONFIG.flashEnabled);
  const [vibrationEnabled, setVibrationEnabled] = useState(DEFAULT_CONFIG.vibrationEnabled);

  const getIntervalSettings = () => {
    if (isCustom) {
      return {
        minGap: parseFloat(customMinGap) || 1,
        avgFrequency: parseFloat(customAvgFrequency) || 5,
      };
    }
    return {
      minGap: COMBO_MAP[combo],
      avgFrequency: INTENSITY_MAP[intensity],
    };
  };

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

    navigation.navigate('Running', { workout, soundChoice, flashEnabled, vibrationEnabled });
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
                <Text style={styles.swapIcon}>↔</Text>
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

        {/* ── Section 2: Intensity ────────────────────────────── */}
        <Text style={styles.sectionLabel}>Intensity</Text>
        <View style={styles.card}>
          {isCustom ? (
            <View style={styles.customInputs}>
              <View style={styles.customRow}>
                <Text style={styles.customLabel}>Min gap (sec)</Text>
                <TextInput
                  style={styles.customInput}
                  value={customMinGap}
                  onChangeText={setCustomMinGap}
                  keyboardType="decimal-pad"
                  maxLength={4}
                />
              </View>
              <View style={styles.customRow}>
                <Text style={styles.customLabel}>Avg frequency (sec)</Text>
                <TextInput
                  style={styles.customInput}
                  value={customAvgFrequency}
                  onChangeText={setCustomAvgFrequency}
                  keyboardType="decimal-pad"
                  maxLength={4}
                />
              </View>
              <TouchableOpacity style={styles.customToggle} onPress={() => setIsCustom(false)}>
                <Text style={styles.customToggleText}>← Presets</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pickerContainer}>
              {/* Intensity row */}
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>Intensity</Text>
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
                <Text style={styles.pickerLabel}>Combo</Text>
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

              {/* Custom link */}
              <View style={styles.customLinkRow}>
                <TouchableOpacity onPress={() => setIsCustom(true)}>
                  <Text style={styles.customLinkText}>Custom</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Section 3: Sound & Feedback ────────────────────── */}
        <Text style={styles.sectionLabel}>Sound</Text>
        <View style={styles.card}>
          <View style={styles.soundRow}>
            {SOUND_OPTIONS.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.soundButton, soundChoice === s && styles.soundButtonActive]}
                onPress={() => setSoundChoice(s)}
              >
                <Text style={[styles.soundButtonText, soundChoice === s && styles.soundButtonTextActive]}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

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
          <Text style={styles.startButtonText}>START</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

function DurationPicker({ label, color, value, onChange, variant }) {
  const [isOpen, setIsOpen] = useState(false);
  const display = `${String(value.minutes).padStart(2, '0')}:${String(value.seconds).padStart(2, '0')}`;

  const pickerModal = (
    <Modal visible={isOpen} transparent animationType="slide">
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
          <Text style={styles.durationDisplay}>{display}</Text>
        </TouchableOpacity>
        {pickerModal}
      </View>
    );
  }

  return (
    <View style={[styles.durationBlock, { borderTopColor: color }]}>
      <Text style={styles.durationLabel}>{label}</Text>
      <TouchableOpacity onPress={() => setIsOpen(true)}>
        <Text style={styles.durationDisplay}>{display}</Text>
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
      <Modal visible={isOpen} transparent animationType="slide">
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    width: 64,
  },
  segmentRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 7,
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
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
  },
  customLinkRow: {
    alignItems: 'flex-end',
    paddingTop: 2,
  },
  customLinkText: {
    fontSize: 13,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },

  // Custom inputs
  customInputs: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customLabel: {
    fontSize: 14,
    color: '#374151',
  },
  customInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    width: 70,
    textAlign: 'center',
    color: '#111827',
  },
  customToggle: {
    alignSelf: 'flex-start',
  },
  customToggleText: {
    fontSize: 13,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },

  // Sound picker
  soundRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  soundButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  soundButtonActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  soundButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  soundButtonTextActive: {
    color: '#EF4444',
  },

  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  toggleLabel: {
    fontSize: 15,
    color: '#374151',
  },

  // Start button
  startButton: {
    marginTop: 28,
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
});
