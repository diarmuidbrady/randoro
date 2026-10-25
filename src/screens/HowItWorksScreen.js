import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  AppState,
  Platform,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PHASE_COLORS } from '../constants/theme';

// Set the first time this screen opens. SetupScreen opens it automatically until then.
export const TUTORIAL_SEEN_KEY = 'tutorialSeen';

const PAGE_COUNT = 5;
const FLASH_DURATION_MS = 300;
const PING_UPDATE_MS = 20;    // how often the ping player reports its position while playing
const PING_FALLBACK_MS = 400; // flash anyway if the ping never reports playing
const COUNTDOWN_STEP_MS = 1000;

const WORK = PHASE_COLORS.work;

export default function HowItWorksScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pagerRef = useRef(null);
  const [page, setPage] = useState(0);
  const [pagerHeight, setPagerHeight] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    AsyncStorage.setItem(TUTORIAL_SEEN_KEY, '1').catch(() => {});
  }, []);

  // ── Audio players (expo-audio) ────────────────────────────
  const playerOpts = { keepAudioSessionActive: true };
  const pingPlayer       = useAudioPlayer(require('../../assets/sounds/ping.wav'), { ...playerOpts, updateInterval: PING_UPDATE_MS });
  const doublePlayer     = useAudioPlayer(require('../../assets/sounds/double.wav'), playerOpts);
  const doubleRestPlayer = useAudioPlayer(require('../../assets/sounds/double_rest.wav'), playerOpts);
  const warmupPlayer     = useAudioPlayer(require('../../assets/sounds/warmup.wav'), playerOpts);
  const cooldownPlayer   = useAudioPlayer(require('../../assets/sounds/cooldown.wav'), playerOpts);
  const warningPlayer    = useAudioPlayer(require('../../assets/sounds/warning.wav'), playerOpts);
  const countdownPlayer  = useAudioPlayer(require('../../assets/sounds/countdown.wav'), playerOpts);
  // The same near-silent drone as RunningScreen, so an idle Bluetooth output
  // doesn't clip the first ~0.5 s of a demo beep. No background playback is
  // needed here, so one player restarting at the end is enough, and it pauses
  // while the app is in the background.
  const drone = useAudioPlayer(require('../../assets/sounds/silence.wav'), playerOpts);

  useEffect(() => {
    drone.loop = false;
    drone.volume = 0.05;
    drone.play();

    const restart = async () => {
      try {
        await drone.seekTo(0);
        drone.play();
      } catch {}
    };
    const finishSub = drone.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) restart();
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      try {
        if (state === 'active') drone.play();
        else drone.pause();
      } catch {}
    });

    return () => {
      finishSub.remove();
      appStateSub.remove();
      try { drone.pause(); } catch {}
    };
  }, [drone]);

  const playSound = useCallback(async (player) => {
    try {
      // Await the rewind, or play can run first and the beep is dropped.
      await player.seekTo(0);
      player.play();
    } catch {}
  }, []);

  // The 3-2-1 sequence runs on timers; a new tap or leaving the screen cancels it.
  const sequenceRef = useRef([]);
  const cancelSequence = useCallback(() => {
    sequenceRef.current.forEach(clearTimeout);
    sequenceRef.current = [];
  }, []);
  useEffect(() => cancelSequence, [cancelSequence]);

  const play = useCallback((player) => {
    cancelSequence();
    playSound(player);
  }, [cancelSequence, playSound]);

  const playCountdown = useCallback(() => {
    cancelSequence();
    playSound(countdownPlayer);
    sequenceRef.current = [
      setTimeout(() => playSound(countdownPlayer), COUNTDOWN_STEP_MS),
      setTimeout(() => playSound(countdownPlayer), COUNTDOWN_STEP_MS * 2),
      setTimeout(() => playSound(doublePlayer), COUNTDOWN_STEP_MS * 3),
    ];
  }, [cancelSequence, playSound, countdownPlayer, doublePlayer]);

  // ── Ping demo: flash + haptic in step with the sound ──────
  // As in RunningScreen, they wait for the ping's position to move, so they
  // line up with Bluetooth latency.
  const pingCueRef = useRef(null);
  const flashTimerRef = useRef(null);

  const firePingCue = useCallback(() => {
    if (!pingCueRef.current) return;
    clearTimeout(pingCueRef.current);
    pingCueRef.current = null;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsFlashing(true);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setIsFlashing(false), FLASH_DURATION_MS);
  }, []);

  useEffect(() => {
    const sub = pingPlayer.addListener('playbackStatusUpdate', (status) => {
      if (status.playing && status.currentTime > 0) firePingCue();
    });
    return () => {
      sub.remove();
      clearTimeout(pingCueRef.current);
      clearTimeout(flashTimerRef.current);
    };
  }, [pingPlayer, firePingCue]);

  const playPing = () => {
    play(pingPlayer);
    clearTimeout(pingCueRef.current);
    pingCueRef.current = setTimeout(firePingCue, PING_FALLBACK_MS);
  };

  // ── Paging ────────────────────────────────────────────────
  const close = () => navigation.goBack();
  const isLast = page === PAGE_COUNT - 1;
  const handleNext = () => {
    if (isLast) close();
    else pagerRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };
  const handleScroll = (e) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setPage(Math.max(0, Math.min(PAGE_COUNT - 1, next)));
  };

  const demoBg = isFlashing ? WORK.text : WORK.background;
  const demoFg = isFlashing ? WORK.background : WORK.text;

  const pages = [
    <Page key="beep" title="React to the beep">
      <Para>In each work round, Randoro beeps at random times. Each beep is your cue: throw your combination.</Para>
      <Para>You never know when the next one is coming, so stay ready.</Para>
      <View style={[styles.demo, { backgroundColor: demoBg }]}>
        <View style={styles.soundText}>
          <Text style={[styles.demoTitle, { color: demoFg }]}>Random beep</Text>
          <Text style={[styles.demoDetail, { color: demoFg }]}>Short and high. Throw now.</Text>
        </View>
        <PlayButton label="Random beep" onPress={playPing} color={demoFg} />
      </View>
      <Para>Each random beep also flashes the screen and vibrates. Turn them off under Feedback with Screen Flash and Vibration.</Para>
    </Page>,

    <Page key="structure" title="Round Structure">
      <Item term="Warm Up and Cool Down:">time before the first round and after the last.</Item>
      <Item term="Rounds:">how many work rounds.</Item>
      <Item term="Work and Rest:">how long each round lasts, and the break between rounds.</Item>
      <Para>Tap a time or the round count to change it with the scroll wheel.</Para>
      <Item term="↔">swaps whether Rest or Work comes first.</Item>
    </Page>,

    <Page key="style" title="Workout Style">
      <Heading>Preset</Heading>
      <Item term="Intensity:">Low, Medium or High. How often the beeps fire.</Item>
      <Item term="Attack Length:">the execution time, the fixed time you get to attack after each beep, based on the number of punches you throw: 1-2, 3-4 or 5-6+.</Item>
      <Heading>Manual</Heading>
      <Item term="Intensity:">set it by Time, the avg. anticipation time before each beep, or by Count, the number of attacks per round. Anticipation is the variable part.</Item>
      <Item term="Attack Length:">the fixed execution time after each beep, in seconds. Set it to fit the number of punches you throw.</Item>
      <Item term="Avg. Time Between Beeps:">the variable anticipation time plus the fixed execution time.</Item>
      <Para>If the attacks don't fit the round, an error shows and you can't start until you change something.</Para>
      <Heading>Simple</Heading>
      <Para>A plain interval timer with no random beeps. Screen Flash and Vibration are greyed out.</Para>
    </Page>,

    <Page key="sounds" title="The other sounds">
      <Para>These mark the structure of the workout. Tap ▶ to hear each one.</Para>
      <SoundRow title="Warm-up start" detail="Three rising tones." onPlay={() => play(warmupPlayer)} />
      <SoundRow title="Round start" detail="A double beep." onPlay={() => play(doublePlayer)} />
      <SoundRow title="Rest start" detail="Two lower, longer beeps." onPlay={() => play(doubleRestPlayer)} />
      <SoundRow title="10 s warning" detail="One long low beep, 10 seconds before a round." onPlay={() => play(warningPlayer)} />
      <SoundRow title="3-2-1" detail="Three long beeps into the round start." onPlay={playCountdown} />
      <SoundRow title="Cool-down and done" detail="Three falling tones." onPlay={() => play(cooldownPlayer)} />
    </Page>,

    <Page key="running" title="During a workout">
      <Item term="BEGIN">starts the timer. PAUSE and RESUME stop and continue it.</Item>
      <Item term="‹ ›">jump to the previous or next phase.</Item>
      <Item term="✕">ends the workout.</Item>
      <Para>Lock your phone or switch apps and the beeps keep going, in the background and on the lock screen.</Para>
    </Page>,
  ];

  // On iOS the modal card already sits below the status bar.
  const topPadding = Platform.OS === 'ios' ? 12 : insets.top + 12;

  return (
    <View style={[styles.container, { paddingTop: topPadding, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.topBar}>
        <Text style={styles.screenLabel}>How it works</Text>
        {!isLast && (
          <TouchableOpacity onPress={close} hitSlop={12} accessibilityRole="button">
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.pager}
        onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
      >
        {/* A fixed height lets each page scroll vertically inside the pager. */}
        {pages.map((content, i) => (
          <View key={i} style={{ width, height: pagerHeight }}>{content}</View>
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.dots} accessibilityLabel={`Step ${page + 1} of ${PAGE_COUNT}`}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.nextButtonText}>
            {isLast ? 'DONE' : 'NEXT'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Each page scrolls on its own, so large text sizes still fit.
function Page({ title, children }) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.pageTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.card}>{children}</View>
    </ScrollView>
  );
}

function Para({ children }) {
  return <Text style={styles.body}>{children}</Text>;
}

function Heading({ children }) {
  return <Text style={styles.heading} accessibilityRole="header">{children}</Text>;
}

function Item({ term, children }) {
  return (
    <Text style={styles.body}>
      <Text style={styles.term}>{term}</Text> {children}
    </Text>
  );
}

function PlayButton({ label, onPress, color = '#111827' }) {
  return (
    <TouchableOpacity
      style={[styles.playButton, { borderColor: color }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play ${label}`}
    >
      <Text maxFontSizeMultiplier={2} style={[styles.playIcon, { color }]}>▶</Text>
    </TouchableOpacity>
  );
}

function SoundRow({ title, detail, onPlay }) {
  return (
    <View style={styles.soundRow}>
      <View style={styles.soundText}>
        <Text style={styles.soundTitle}>{title}</Text>
        <Text style={styles.soundDetail}>{detail}</Text>
      </View>
      <PlayButton label={title} onPress={onPlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 12,
  },
  screenLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  pager: {
    flex: 1,
  },
  pageContent: {
    padding: 16,
    paddingTop: 8,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    gap: 14,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    color: '#374151',
  },
  term: {
    fontWeight: '700',
    color: '#111827',
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
  },

  // Ping demo
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    padding: 16,
  },
  demoTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  demoDetail: {
    fontSize: 14,
    marginTop: 2,
  },

  // Sound rows
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  soundText: {
    flex: 1,
    flexShrink: 1,
  },
  soundTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  soundDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  playButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  playIcon: {
    fontSize: 16,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  dotActive: {
    backgroundColor: '#111827',
  },
  nextButton: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
