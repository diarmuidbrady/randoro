import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
} from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';

// Native AppDelegate sets .playback at launch (plugins/withAudioSession.js).
// This call sets shouldPlayInBackground=true (without it, expo-audio explicitly
// pauses all players when the app backgrounds). interruptionMode='duckOthers'
// allows our audio to mix with other apps (e.g. music players) instead of
// silencing them, and also prevents iOS from pausing our audio when a
// notification arrives. playsInSilentMode allows audio on silent mode, which
// is essential for the beeps to work in background on iOS. allowsRecording=false
// is required for background audio.
setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  allowsRecording: false,
  interruptionMode: 'duckOthers',
}).catch(() => {});

import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PHASE_COLORS } from '../constants/theme';
import { formatTime, formatElapsed } from '../utils/time';

const TICK_MS = 100;
const FLASH_DURATION_MS = 300;

export default function RunningScreen({ route, navigation }) {
  const { workout, soundChoice, flashEnabled, vibrationEnabled } = route.params;
  const { events, phases, totalDuration } = workout;
  const insets = useSafeAreaInsets();

  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  const startTimeRef = useRef(null);
  const pausedElapsedRef = useRef(0);
  const intervalRef = useRef(null);
  const lastEventElapsedRef = useRef(-1);
  const lastTickWallTimeRef = useRef(null); // for catch-up detection after backgrounding
  const flashAnim = useRef(new Animated.Value(0)).current;

  // ── Audio players (expo-audio) ────────────────────────────
  // keepAudioSessionActive: true prevents expo-audio from calling setActive(false)
  // after each beep finishes. Without this, between beeps the session deactivates
  // and iOS suspends the app in background, killing subsequent beeps.
  const playerOpts = { keepAudioSessionActive: true };
  const pingPlayer       = useAudioPlayer(require('../../assets/sounds/ping.wav'), playerOpts);
  const doublePlayer     = useAudioPlayer(require('../../assets/sounds/double.wav'), playerOpts);
  const doubleRestPlayer = useAudioPlayer(require('../../assets/sounds/double_rest.wav'), playerOpts);
  const triplePlayer     = useAudioPlayer(require('../../assets/sounds/triple.wav'), playerOpts);
  // 60 min low-amplitude 110 Hz sine, played non-looped at volume 0.05 while running.
  // Bluetooth audio routing in background and on lock screen needs constant non-zero
  // volume — discrete beeps with gaps aren't enough. Loop=false because expo-audio's
  // loop=true has a ~100 ms restart gap iOS treats as "audio stopped". 0.05 is below
  // the threshold of perception in a normal room.
  // See memory/project_audio_journey_log.md.
  const silencePlayer    = useAudioPlayer(require('../../assets/sounds/silence.wav'), playerOpts);

  useEffect(() => {
    silencePlayer.loop = false;
    silencePlayer.volume = 0.05;
  }, [silencePlayer]);

  useEffect(() => {
    if (isRunning) {
      silencePlayer.play();
      return () => silencePlayer.pause();
    }
  }, [isRunning, silencePlayer]);

  // ── Keep awake ────────────────────────────────────────────
  useEffect(() => {
    activateKeepAwakeAsync();
    return () => deactivateKeepAwake();
  }, []);

  // ── Phase helpers ─────────────────────────────────────────
  const currentPhase = phases.find(p => elapsed >= p.start && elapsed < p.end)
    ?? phases[phases.length - 1];

  const phaseColors = PHASE_COLORS[currentPhase.type] ?? PHASE_COLORS.idle;
  const phaseRemaining = Math.max(0, currentPhase.end - elapsed);
  const totalRemaining = Math.max(0, totalDuration - elapsed);
  const currentRoundCount = phases.filter(p => p.type === 'work').length;

  // ── Sound helper ──────────────────────────────────────────
  const playSound = useCallback((player) => {
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Audio not available — haptics still fire
    }
  }, []);

  const playerForPhaseType = useCallback((type) => {
    if (type === 'work')     return doublePlayer;
    if (type === 'rest')     return doubleRestPlayer;
    return triplePlayer; // warmup, cooldown, done
  }, [doublePlayer, doubleRestPlayer, triplePlayer]);

  // ── Flash helper ──────────────────────────────────────────
  const triggerFlash = useCallback(() => {
    if (!flashEnabled) return;
    setIsFlashing(true);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: FLASH_DURATION_MS / 2, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: FLASH_DURATION_MS / 2, useNativeDriver: true }),
    ]).start(() => setIsFlashing(false));
  }, [flashEnabled, flashAnim]);

  // ── Tick ──────────────────────────────────────────────────
  const tick = useCallback(() => {
    const now = Date.now();
    const current = pausedElapsedRef.current + (now - startTimeRef.current) / 1000;

    // If > 1 s has passed since the last tick the app was backgrounded.
    // Silently advance the timer but skip sounds/haptics/flash.
    const isCatchUp = lastTickWallTimeRef.current !== null
      && (now - lastTickWallTimeRef.current) > 1000;
    lastTickWallTimeRef.current = now;

    const pingsToFire = events.filter(
      e => e.type === 'ping' && e.time > lastEventElapsedRef.current && e.time <= current
    );
    if (!isCatchUp && pingsToFire.length > 0) {
      if (vibrationEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      playSound(pingPlayer);
      triggerFlash();
    }

    const phaseEvents = events.filter(
      e => e.type !== 'ping' && e.time > lastEventElapsedRef.current && e.time <= current
    );

    if (phaseEvents.some(e => e.type === 'done')) {
      clearInterval(intervalRef.current);
      if (!isCatchUp) playSound(triplePlayer);
      setElapsed(totalDuration);
      setIsRunning(false);
      setIsDone(true);
      lastEventElapsedRef.current = totalDuration;
      if (!isCatchUp && vibrationEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    if (!isCatchUp) {
      for (const e of phaseEvents) {
        if (e.type === 'round_start')         playSound(doublePlayer);
        else if (e.type === 'rest_start')     playSound(doubleRestPlayer);
        else if (e.type === 'warmup_start')   playSound(triplePlayer);
        else if (e.type === 'cooldown_start') playSound(triplePlayer);
      }
    }

    lastEventElapsedRef.current = current;
    setElapsed(current);
  }, [
    events, totalDuration, vibrationEnabled,
    pingPlayer, doublePlayer, doubleRestPlayer, triplePlayer,
    playSound, triggerFlash,
  ]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(tick, TICK_MS);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, tick]);

  // ── Controls ──────────────────────────────────────────────
  const handleStartPause = () => {
    if (isDone) return;
    if (!isRunning) {
      startTimeRef.current = Date.now();
      lastTickWallTimeRef.current = null; // reset so resume doesn't look like catch-up
      setIsRunning(true);
    } else {
      clearInterval(intervalRef.current);
      pausedElapsedRef.current += (Date.now() - startTimeRef.current) / 1000;
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    clearInterval(intervalRef.current);
    navigation.goBack();
  };

  const jumpToPhaseIndex = useCallback((index) => {
    const clamped = Math.max(0, Math.min(index, phases.length - 1));
    const targetPhase = phases[clamped];
    const targetTime = targetPhase.start;
    pausedElapsedRef.current = targetTime;
    lastEventElapsedRef.current = targetTime;
    setElapsed(targetTime);
    if (isRunning) startTimeRef.current = Date.now();
    playSound(playerForPhaseType(targetPhase.type));
  }, [phases, isRunning, playSound, playerForPhaseType]);

  const currentPhaseIndex = phases.indexOf(currentPhase);
  const handlePrevPhase = () => jumpToPhaseIndex(currentPhaseIndex - 1);
  const handleNextPhase = () => jumpToPhaseIndex(currentPhaseIndex + 1);

  // ── Colours: invert on flash ──────────────────────────────
  const bgColor = isFlashing ? phaseColors.text : phaseColors.background;
  const fgColor = isFlashing ? phaseColors.background : phaseColors.text;

  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleStop} hitSlop={styles.hitSlop}>
          <Text style={[styles.topBarIcon, { color: fgColor }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.phaseLabel, { color: fgColor }]}>{currentPhase.label}</Text>
        <View style={styles.hitSlop} />
      </View>

      {/* Large countdown */}
      <View style={styles.timerBlock}>
        <Text style={[styles.timerText, { color: fgColor }]}>
          {formatTime(phaseRemaining)}
        </Text>
      </View>

      {/* Round info */}
      <View style={styles.roundBlock}>
        <TouchableOpacity onPress={handlePrevPhase} hitSlop={styles.hitSlop}>
          <Text style={[styles.arrowText, { color: fgColor }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.roundInfo}>
          {currentPhase.type === 'work' ? (
            <Text style={[styles.roundText, { color: fgColor }]}>
              Round {currentPhase.round} of {currentRoundCount}
            </Text>
          ) : (
            <Text style={[styles.roundText, { color: fgColor }]}>{currentPhase.label}</Text>
          )}
        </View>
        <TouchableOpacity onPress={handleNextPhase} hitSlop={styles.hitSlop}>
          <Text style={[styles.arrowText, { color: fgColor }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Elapsed / Remaining */}
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { color: fgColor }]}>{formatElapsed(elapsed)}</Text>
          <Text style={[styles.statLabel, { color: fgColor, opacity: 0.6 }]}>Elapsed</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { color: fgColor }]}>{formatTime(totalRemaining)}</Text>
          <Text style={[styles.statLabel, { color: fgColor, opacity: 0.6 }]}>Remaining</Text>
        </View>
      </View>

      {/* Play/Pause */}
      <View style={styles.controlsBlock}>
        <TouchableOpacity
          style={[styles.playButton, { borderColor: fgColor, opacity: isDone ? 0.4 : 1 }]}
          onPress={handleStartPause}
          disabled={isDone}
        >
          <Text style={[styles.playButtonText, { color: fgColor }]}>
            {isDone ? 'DONE' : isRunning ? 'PAUSE' : elapsed > 0 ? 'RESUME' : 'BEGIN'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  topBarIcon: {
    fontSize: 22,
    fontWeight: '300',
    width: 32,
  },
  phaseLabel: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  hitSlop: {
    width: 32,
    top: 12,
    bottom: 12,
    left: 12,
    right: 12,
  },
  timerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 88,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  roundBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 20,
  },
  arrowText: {
    fontSize: 36,
    fontWeight: '300',
  },
  roundInfo: {
    alignItems: 'center',
    minWidth: 160,
  },
  roundText: {
    fontSize: 17,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingVertical: 16,
  },
  statBlock: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  controlsBlock: {
    paddingHorizontal: 40,
    paddingBottom: 32,
    paddingTop: 8,
  },
  playButton: {
    borderWidth: 2,
    borderRadius: 50,
    paddingVertical: 22,
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 3,
  },
});
