import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WheelPicker from '../components/WheelPicker';
import { Segments } from '../components/Controls';
import { Chevron } from '../components/CallShape';
import FocusSection, { newCall } from '../components/FocusSection';
import IntensitySection from '../components/IntensitySection';
import {
  Spotlight,
  TourControls,
  TipControls,
  TIPS,
  TOUR_SEEN_KEY,
  TIPS_SEEN_KEY,
  tourSteps,
  switchTourPath,
} from '../components/CoachMarks';
import { FLASH_STYLES, LEVELS, FACE_COLOR } from '../constants/theme';
import { formatTime, parseSeconds } from '../utils/time';
import { generateWorkout, maxPings, meanAttack } from '../utils/generator';
import { attackTime, callKey, BETWEEN_BEEPS_MAX, MAX_CALLS } from '../utils/combo';
import { roundPlan, presetToManual, manualToPreset, manualFromWait } from '../utils/intensity';
import {
  structureSummary,
  beepsSummary,
  focusSummary,
  intensitySummary,
  feedbackSummary,
} from '../utils/summary';

// Every setup setting, saved on the device so the screen opens as the user left it.
const CONFIG_KEY = 'setupConfig';

const DEFAULT_CONFIG = {
  warmup: {minutes: 0, seconds: 5},
  rounds: '3',
  workDuration: {minutes: 3, seconds: 0},
  restDuration: {minutes: 1, seconds: 0},
  restFirst: false,
  cooldown: {minutes: 0, seconds: 5},
  randomBeeps: true,
  calls: [newCall()],
  betweenBeeps: '',
  focus: '',
  intensityMode: 'Preset',     // Preset or Manual
  scope: 'All',                // All, PerRound or WithinRound (Advanced)
  level: 'M',
  roundLevels: [],
  thirdLevels: ['M', 'M', 'M'],
  manual: manualFromWait(LEVELS.M.wait),
  roundManual: [],
  thirdWaits: [LEVELS.M.wait, LEVELS.M.wait, LEVELS.M.wait],
  flashEnabled: true,
  flashStyle: 'Soft',
  vibrationEnabled: true,
  collapsed: {},               // sections shown as their one-line summary
};

const TOOLTIPS = {
  combo: {
    title: 'Your combo',
    text: 'What you throw on the beep, e.g. 1-2, head-body-head or jab-slip-jab. Tap to change the combo length. Hold to type your own, with commas or dashes between moves.',
  },
};

const SCROLL_SETTLE_MS = 350; // wait for a scroll to finish before measuring a spotlight
const TOUR_STEP_DELAY_MS = 50;
const TIP_DELAY_MS = 300;     // a tip waits for the section it points at to lay out

// A saved config from an older version may miss fields or hold bad calls.
function withDefaults(saved) {
  const config = { ...DEFAULT_CONFIG, ...(saved ?? {}) };
  if (!Array.isArray(config.calls) || config.calls.length === 0) config.calls = DEFAULT_CONFIG.calls;
  config.calls = config.calls.slice(0, MAX_CALLS).map(c => ({ ...newCall(), ...c }));
  return config;
}

export default function SetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState(null);
  const [tooltipKey, setTooltipKey] = useState(null);

  // ── Load and save ─────────────────────────────────────────
  const [tour, setTour] = useState(null); // { path, index, restoreBeepsOff }
  const [tip, setTip] = useState(null);
  const tipsSeenRef = useRef(null);

  useEffect(() => {
    (async () => {
      let saved = null;
      try { saved = JSON.parse(await AsyncStorage.getItem(CONFIG_KEY)); } catch {}
      const initial = withDefaults(saved);
      // With Reduce Motion on, the flash starts as Minimal: the background stays still.
      if (!saved) {
        try { if (await AccessibilityInfo.isReduceMotionEnabled()) initial.flashStyle = 'Minimal'; } catch {}
      }
      // The tour runs by itself the first time. It needs Random Beeps on to
      // show Focus and Intensity, and turns them back off after.
      let tourSeen = true;
      try {
        tourSeen = !!(await AsyncStorage.getItem(TOUR_SEEN_KEY));
        tipsSeenRef.current = new Set(JSON.parse(await AsyncStorage.getItem(TIPS_SEEN_KEY)) ?? []);
      } catch {}
      if (!tourSeen) {
        setTour({ path: 'Simple', index: 0, restoreBeepsOff: !initial.randomBeeps, restoreCollapsed: initial.collapsed });
        initial.randomBeeps = true;
        initial.collapsed = {};
        AsyncStorage.setItem(TOUR_SEEN_KEY, '1').catch(() => {});
      }
      setConfig(initial);
    })();
  }, []);

  useEffect(() => {
    if (config) AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config)).catch(() => {});
  }, [config]);

  const update = useCallback((patch) => {
    setConfig(c => ({ ...c, ...(typeof patch === 'function' ? patch(c) : patch) }));
  }, []);

  // ── Spotlight targets ─────────────────────────────────────
  // Sections register the views the tour and tips point at.
  const targetsRef = useRef({});
  const targetRefs = useRef({});
  const target = useCallback((key) => {
    if (!targetRefs.current[key]) {
      targetRefs.current[key] = (el) => { targetsRef.current[key] = el; };
    }
    return targetRefs.current[key];
  }, []);

  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const [frame, setFrame] = useState(null); // the container's size
  const [spot, setSpot] = useState(null);

  const mark = tour ? tourSteps(tour.path)[tour.index] : tip ? TIPS[tip] : null;

  // Scroll the mark's target into view, then measure it for the spotlight.
  useEffect(() => {
    if (!mark || !frame) return;
    setSpot(null);
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    later(() => {
      const el = [].concat(mark.target).map(k => targetsRef.current[k]).find(Boolean);
      if (!el) return setSpot({ none: true });
      // The container is measured with the target each time: the screen may
      // still be sliding in, and only their positions relative to each other count.
      const measure = (done) => containerRef.current?.measureInWindow((cx, cy) => {
        el.measureInWindow((x, y, width, height) => done({ x: x - cx, y: y - cy, width, height }));
      });
      measure(({ y, height }) => {
        const viewHeight = frame.height - insets.top;
        const contentY = y - insets.top + scrollYRef.current;
        const fits = height < viewHeight - 160;
        const scrollTo = Math.max(0, fits ? contentY - (viewHeight - height) / 2 : contentY - 80);
        const moved = Math.abs(scrollTo - scrollYRef.current) > 4;
        if (moved) scrollRef.current?.scrollTo({ y: scrollTo, animated: true });
        later(() => measure(setSpot), moved ? SCROLL_SETTLE_MS : 0);
      });
    }, tour ? TOUR_STEP_DELAY_MS : TIP_DELAY_MS);

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.path, tour?.index, tip, frame, insets.top]);


  // ── Tour ──────────────────────────────────────────────────
  // The tour opens every section, and puts them back as they were after.
  const startTour = () => {
    setTip(null);
    setTour({ path: 'Simple', index: 0, restoreBeepsOff: !config.randomBeeps, restoreCollapsed: config.collapsed });
    update({ randomBeeps: true, collapsed: {} });
  };

  const endTour = () => {
    if (tour?.restoreBeepsOff) update({ randomBeeps: false });
    if (tour?.restoreCollapsed) update({ collapsed: tour.restoreCollapsed });
    setTour(null);
    setSpot(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const stepCount = tour ? tourSteps(tour.path).length : 0;
  const nextStep = () => {
    if (tour.index >= stepCount - 1) endTour();
    else setTour({ ...tour, index: tour.index + 1 });
  };
  const prevStep = () => setTour({ ...tour, index: Math.max(0, tour.index - 1) });
  const choosePath = (path) => setTour({ ...tour, ...switchTourPath(tour, path) });

  // ── First-time tips ───────────────────────────────────────
  const showTip = useCallback((key) => {
    const seen = tipsSeenRef.current;
    if (tour || !seen || seen.has(key)) return;
    seen.add(key);
    AsyncStorage.setItem(TIPS_SEEN_KEY, JSON.stringify([...seen])).catch(() => {});
    setTip(key);
  }, [tour]);

  if (!config) return <View style={styles.container} />;

  // ── Derived values ────────────────────────────────────────
  const rounds = parseInt(config.rounds) || 1;
  const work = parseSeconds(config.workDuration);
  const beepTypes = config.calls.map((call, i) => ({
    label: callKey(i, config.calls.length),
    attack: attackTime(call),
    combo: call.combo.trim(),
  }));
  const attack = meanAttack(beepTypes);
  const { randomBeeps } = config;

  const changeMode = (mode) => {
    if (mode === config.intensityMode) return;
    update(c => ({
      intensityMode: mode,
      ...(mode === 'Manual' ? presetToManual(c) : manualToPreset(c, work, attack)),
    }));
    if (mode === 'Manual') showTip('manual');
  };

  const handleStart = () => {
    if (work < 10) {
      Alert.alert('Invalid', 'Work duration must be at least 10 seconds.');
      return;
    }
    if (randomBeeps && maxPings(work, attack) < 1) {
      Alert.alert("Combos don't fit", `A ${formatTime(work)} round is too short for your combos. Make the round longer or the combos shorter.`);
      return;
    }

    const workout = generateWorkout({
      warmup: parseSeconds(config.warmup),
      rounds,
      workDuration: work,
      restDuration: parseSeconds(config.restDuration),
      restFirst: config.restFirst,
      cooldown: parseSeconds(config.cooldown),
      beepTypes,
      roundPlans: Array.from({ length: rounds }, (_, i) => roundPlan(config, i, work, attack)),
      randomBeeps,
    });

    // Flash and vibration only fire on the random beeps, so they're off without them.
    navigation.navigate('Running', {
      workout,
      flashEnabled: randomBeeps && config.flashEnabled,
      flashStyle: config.flashStyle,
      vibrationEnabled: randomBeeps && config.vibrationEnabled,
      focusText: (randomBeeps ? config.betweenBeeps : config.focus).trim(),
    });
  };

  const { restFirst, collapsed } = config;
  const setField = (key) => (value) => update({ [key]: value });
  const toggleSection = (key) => update(c => ({ collapsed: { ...c.collapsed, [key]: !c.collapsed[key] } }));

  return (
    <View ref={containerRef} onLayout={(e) => setFrame(e.nativeEvent.layout)} style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >

        <TouchableOpacity
          style={styles.howItWorks}
          onPress={startTour}
          accessibilityRole="button"
        >
          <Text style={styles.howItWorksText}>How it works</Text>
        </TouchableOpacity>

        {/* ── Round structure ───────────────────────────────────── */}
        <Section
          level={1}
          title="Round structure"
          summary={structureSummary(config)}
          collapsed={collapsed.structure}
          onToggle={() => toggleSection('structure')}
          boxRef={target('structure')}
        >
          <View style={styles.card}>

            {/* Warmup */}
            <View style={styles.secondaryRow}>
              <Text maxFontSizeMultiplier={2.5} style={styles.secondaryLabel}>Warm Up</Text>
              <DurationPicker
                label={''}
                value={config.warmup}
                onChange={setField('warmup')}
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
                  value={config.rounds}
                  onChangeText={setField('rounds')}
                />
              </View>

              {/* Work ↔ Rest horizontal layout */}
              <View style={styles.workRestRow}>
                {restFirst ? (
                  <DurationPicker label="Rest" value={config.restDuration} onChange={setField('restDuration')} color="#22C55E" />
                ) : (
                  <DurationPicker label="Work" value={config.workDuration} onChange={setField('workDuration')} color="#EF4444" />
                )}
                <TouchableOpacity style={styles.swapButton} onPress={() => update({ restFirst: !restFirst })}>
                  <Text maxFontSizeMultiplier={2} style={styles.swapIcon}>↔</Text>
                </TouchableOpacity>
                {restFirst ? (
                  <DurationPicker label="Work" value={config.workDuration} onChange={setField('workDuration')} color="#EF4444"
                  variant={"main"}/>
                ) : (
                  <DurationPicker label="Rest" value={config.restDuration} onChange={setField('restDuration')} color="#22C55E"
                  variant={"main"}/>
                )}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Cooldown */}
            <View style={styles.secondaryRow}>
              <Text maxFontSizeMultiplier={2.5} style={styles.secondaryLabel}>Cool Down</Text>
              <DurationPicker
                value={config.cooldown}
                onChange={setField('cooldown')}
                color={'#6B7280'}
                variant={"peripheral"}
              />
            </View>
          </View>
        </Section>

        {/* ── Random beeps: Focus, Intensity and Feedback ──────────── */}
        <Section
          level={1}
          title="Random beeps"
          summary={beepsSummary(config, work, attack)}
          collapsed={collapsed.beeps}
          onToggle={() => toggleSection('beeps')}
          headerRef={target('beepsToggle')}
          right={(
            <Switch
              value={randomBeeps}
              onValueChange={setField('randomBeeps')}
              accessibilityLabel="Random beeps"
            />
          )}
        >
          <View style={styles.beepsBody}>
          {!randomBeeps ? (
            <View style={styles.offBlock}>
              <Text style={styles.offNote}>
                A plain interval timer with no random beeps. You'll only hear beeps for rounds, rests and countdowns.
              </Text>
              <Text style={styles.textLabel}>Focus</Text>
              <TextInput
                style={styles.textBox}
                value={config.focus}
                onChangeText={setField('focus')}
                placeholder="e.g. footwork and defense"
                placeholderTextColor="#9CA3AF"
                maxLength={BETWEEN_BEEPS_MAX}
                returnKeyType="done"
                accessibilityLabel="Focus"
              />
            </View>
          ) : (
            <>
              <Section
                level={2}
                title="Focus"
                summary={focusSummary(config)}
                collapsed={collapsed.focus}
                onToggle={() => toggleSection('focus')}
                boxRef={target('focus')}
              >
                <FocusSection
                    calls={config.calls}
                    onChangeCalls={setField('calls')}
                    betweenBeeps={config.betweenBeeps}
                    onChangeBetween={setField('betweenBeeps')}
                    onHelp={setTooltipKey}
                    onCallAdded={() => showTip('calls')}
                    target={target}
                  />
              </Section>

              <Section
                level={2}
                title="Intensity"
                summary={intensitySummary(config, work, attack)}
                collapsed={collapsed.intensity}
                onToggle={() => toggleSection('intensity')}
                boxRef={target('intensity')}
              >
                <IntensitySection
                    config={config}
                    update={update}
                    rounds={rounds}
                    work={work}
                    attack={attack}
                    onModeChange={changeMode}
                    onTip={showTip}
                    target={target}
                  />
              </Section>

              {/* Flash and vibration only fire on the random beeps */}
              <Section
                level={2}
                title="Feedback"
                summary={feedbackSummary(config)}
                collapsed={collapsed.feedback}
                onToggle={() => toggleSection('feedback')}
              >
                <View style={styles.feedbackBody}>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Screen flash</Text>
                    <Switch value={config.flashEnabled} onValueChange={setField('flashEnabled')} />
                  </View>
                  {config.flashEnabled && (
                    <View style={styles.flashStyleRow}>
                      <Segments labels={FLASH_STYLES} value={config.flashStyle} onChange={setField('flashStyle')} />
                    </View>
                  )}
                  <View style={[styles.toggleRow, styles.toggleRowDivided]}>
                    <Text style={styles.toggleLabel}>Vibration</Text>
                    <Switch value={config.vibrationEnabled} onValueChange={setField('vibrationEnabled')} />
                  </View>
                </View>
              </Section>
            </>
          )}
          </View>
        </Section>

        {/* ── Enter: the same pill as GET READY and BEGIN ───────────── */}
        <View ref={target('start')} collapsable={false} style={styles.startWrap}>
          <TouchableOpacity style={styles.startButton} onPress={handleStart} accessibilityRole="button">
            <Text maxFontSizeMultiplier={2} style={styles.startButtonText}>ENTER</Text>
          </TouchableOpacity>
        </View>
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

      {/* ── Tour and tips ─────────────────────────────────────── */}
      {mark && frame && (
        <Spotlight
          rect={spot}
          screen={{ width: frame.width, height: frame.height, top: insets.top, bottom: insets.bottom }}
          caption={mark.caption}
          onNext={tour ? nextStep : () => setTip(null)}
        >
          {tour ? (
            <TourControls
              path={tour.path}
              onPath={choosePath}
              index={tour.index}
              count={stepCount}
              onBack={prevStep}
              onSkip={endTour}
              onNext={nextStep}
            />
          ) : (
            <TipControls onDone={() => setTip(null)} />
          )}
        </Spotlight>
      )}
    </View>
  );
}

const MINUTES = Array.from({ length: 61 }, (_, i) => i);
const SECONDS = Array.from({ length: 60 }, (_, i) => i);
const ROUNDS = Array.from({ length: 50 }, (_, i) => i + 1);

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
              accessibilityLabel={`${label ?? ''} minutes`.trim()}
              style={{ flex: 1 }}
            />
            <WheelPicker
              items={SECONDS}
              value={value.seconds}
              onChange={(s) => onChange({ ...value, seconds: s })}
              formatLabel={(n) => `${n}s`}
              accessibilityLabel={`${label ?? ''} seconds`.trim()}
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

// A collapsible section in its own box, heading at the top: tapping the
// heading swaps the body for a one-line summary. Level 1 is Round structure
// and Random beeps; level 2 (Focus, Intensity, Feedback) sits inside Random beeps.
function Section({ level, title, summary, collapsed, onToggle, right, headerRef, boxRef, children }) {
  const top = level === 1;
  return (
    <View ref={boxRef} collapsable={false} style={top ? styles.section : styles.subsection}>
      <View
        ref={headerRef}
        collapsable={false}
        style={[styles.sectionHeader, top ? styles.sectionHeaderTop : styles.subsectionHeader]}
      >
        <TouchableOpacity
          style={styles.sectionTitleTouch}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityHint={collapsed ? 'Shows the section' : 'Shows a summary'}
        >
          <View style={styles.sectionTitleRow}>
            <Text maxFontSizeMultiplier={2} style={top ? styles.sectionTitle : styles.subsectionTitle}>{title}</Text>
            <Chevron direction={collapsed ? 'down' : 'up'} size={top ? 14 : 12} color="#9CA3AF" />
          </View>
          {collapsed && (
            <Text numberOfLines={1} maxFontSizeMultiplier={2} style={styles.summary}>{summary}</Text>
          )}
        </TouchableOpacity>
        {right}
      </View>
      {!collapsed && children}
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
  // Sections
  section: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  subsection: {
    backgroundColor: FACE_COLOR,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionHeaderTop: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  subsectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  beepsBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 12,
  },
  sectionTitleTouch: {
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Each heading is larger than everything in its body: section 18, box 16,
  // label 15, body text 14. Semibold and soft greys keep them from shouting.
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4B5563',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  summary: {
    marginTop: 3,
    fontSize: 14,
    color: '#6B7280',
  },
  textLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  offBlock: {
    paddingHorizontal: 4,
    gap: 8,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.35,
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
    fontSize: 18,
    fontWeight: '300',
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

  // Random Beeps
  offNote: {
    paddingBottom: 8,
    fontSize: 14,
    color: '#374151',
  },
  textBox: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },

  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  feedbackBody: {
    paddingBottom: 4,
  },
  toggleRowDivided: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  toggleLabel: {
    fontSize: 14,
    color: '#374151',
  },
  flashStyleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  // Start button
  startWrap: {
    marginTop: 36,
  },
  startButton: {
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: 3,
  },

  peripheralValue: {
    flex: 1,
  },
  durationDisplay: {
    fontSize: 18,
    fontWeight: '300',
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
});
