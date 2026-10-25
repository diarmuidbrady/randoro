import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PHASE_COLORS } from '../constants/theme';
import { formatTime, formatElapsed } from '../utils/time';

const TICK_MS = 100;
const FLASH_DURATION_MS = 300;
const PING_UPDATE_MS = 20;    // how often the ping player reports its position while playing
const PING_FALLBACK_MS = 400; // flash anyway if the ping never reports playing
const SILENCE_HANDOVER_S = 3;

export default function RunningScreen({ route, navigation }) {
  const { workout, flashEnabled, vibrationEnabled } = route.params;
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
  // keepAudioSessionActive stops iOS deactivating the session between beeps,
  // which would suspend the app in the background.
  const playerOpts = { keepAudioSessionActive: true };
  const pingPlayer       = useAudioPlayer(require('../../assets/sounds/ping.wav'), { ...playerOpts, updateInterval: PING_UPDATE_MS });
  const doublePlayer     = useAudioPlayer(require('../../assets/sounds/double.wav'), playerOpts);
  const doubleRestPlayer = useAudioPlayer(require('../../assets/sounds/double_rest.wav'), playerOpts);
  const warmupPlayer     = useAudioPlayer(require('../../assets/sounds/warmup.wav'), playerOpts);
  const cooldownPlayer   = useAudioPlayer(require('../../assets/sounds/cooldown.wav'), playerOpts);
  const warningPlayer    = useAudioPlayer(require('../../assets/sounds/warning.wav'), playerOpts);
  const countdownPlayer  = useAudioPlayer(require('../../assets/sounds/countdown.wav'), playerOpts);
  // A near-silent 5 min 110 Hz tone keeps audio flowing, which background
  // playback and Bluetooth routing need. Two players hand over before the end
  // (loop=true leaves a gap). It plays while this screen is open, because an
  // idle Bluetooth output clips the first ~0.5 s of a beep.
  // See memory/project_audio_journey_log.md.
  const silenceOpts = { keepAudioSessionActive: true, updateInterval: TICK_MS };
  const silenceA = useAudioPlayer(require('../../assets/sounds/silence.wav'), silenceOpts);
  const silenceB = useAudioPlayer(require('../../assets/sounds/silence.wav'), silenceOpts);
  const activeSilenceRef = useRef(0);
  const tickRef = useRef(null);

  useEffect(() => {
    for (const p of [silenceA, silenceB]) {
      p.loop = false;
      p.volume = 0.05;
    }
  }, [silenceA, silenceB]);

  useEffect(() => {
    if (isDone) return;
    const players = [silenceA, silenceB];

    const startFromTop = async (player) => {
      try {
        await player.seekTo(0);
        player.play();
      } catch {}
    };

    players[activeSilenceRef.current].play();

    const subs = players.map((player, i) => player.addListener('playbackStatusUpdate', (status) => {
      if (i !== activeSilenceRef.current) return;
      const remaining = status.duration - status.currentTime;
      if (status.didJustFinish || (status.duration > 0 && remaining <= SILENCE_HANDOVER_S)) {
        activeSilenceRef.current = 1 - i;
        startFromTop(players[1 - i]);
      }
    }));

    return () => {
      subs.forEach((s) => s.remove());
      for (const p of players) {
        try { p.pause(); } catch {}
      }
    };
  }, [isDone, silenceA, silenceB]);

  useEffect(() => {
    if (!isRunning) return;
    const players = [silenceA, silenceB];

    // Android pauses JS timers in the background; the silence players' status updates drive the timer instead.
    const subs = Platform.OS === 'android'
      ? players.map((player, i) => player.addListener('playbackStatusUpdate', () => {
          if (i === activeSilenceRef.current) tickRef.current?.();
        }))
      : [];

    // The lock-screen media session starts the foreground service Android needs
    // to keep the app alive in the background. It's on the ping player so its
    // play/pause button can't stop the silence stream.
    if (Platform.OS === 'android') {
      pingPlayer.setActiveForLockScreen(true, { title: 'randoro', artist: 'Workout in progress' });
    }

    return () => {
      subs.forEach((s) => s.remove());
      if (Platform.OS === 'android') {
        try { pingPlayer.clearLockScreenControls(); } catch {}
      }
    };
  }, [isRunning, silenceA, silenceB, pingPlayer]);

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
  const playSound = useCallback(async (player) => {
    try {
      // Await the rewind, or play can run first and the beep is dropped.
      await player.seekTo(0);
      player.play();
    } catch {
      // Audio not available — haptics still fire
    }
  }, []);

  const playerForPhaseType = useCallback((type) => {
    if (type === 'work')     return doublePlayer;
    if (type === 'rest')     return doubleRestPlayer;
    if (type === 'warmup')   return warmupPlayer;
    return cooldownPlayer; // done
  }, [doublePlayer, doubleRestPlayer, warmupPlayer, cooldownPlayer]);

  // ── Flash helper ──────────────────────────────────────────
  const triggerFlash = useCallback(() => {
    if (!flashEnabled) return;
    setIsFlashing(true);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: FLASH_DURATION_MS / 2, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: FLASH_DURATION_MS / 2, useNativeDriver: true }),
    ]).start(() => setIsFlashing(false));
  }, [flashEnabled, flashAnim]);

  // ── Ping flash + haptic, in step with the sound ───────────
  // Bluetooth delays the sound by ~200 ms. The player's position only moves once
  // the ping is audible, so the flash and haptic wait for that.
  const pingCueRef = useRef(null); // fallback timer while a ping cue is pending

  const firePingCue = useCallback(() => {
    if (!pingCueRef.current) return;
    clearTimeout(pingCueRef.current);
    pingCueRef.current = null;
    if (vibrationEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    triggerFlash();
  }, [vibrationEnabled, triggerFlash]);

  const queuePingCue = useCallback(() => {
    clearTimeout(pingCueRef.current);
    pingCueRef.current = setTimeout(firePingCue, PING_FALLBACK_MS);
  }, [firePingCue]);

  useEffect(() => {
    const sub = pingPlayer.addListener('playbackStatusUpdate', (status) => {
      if (status.playing && status.currentTime > 0) {
        firePingCue();
      }
    });
    return () => {
      sub.remove();
      clearTimeout(pingCueRef.current);
    };
  }, [pingPlayer, firePingCue]);

  // ── Tick ──────────────────────────────────────────────────
  const tick = useCallback(() => {
    // A status update can arrive just after the workout finishes.
    if (lastEventElapsedRef.current >= totalDuration) return;
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
      playSound(pingPlayer);
      queuePingCue();
    }

    const phaseEvents = events.filter(
      e => e.type !== 'ping' && e.time > lastEventElapsedRef.current && e.time <= current
    );

    if (phaseEvents.some(e => e.type === 'done')) {
      clearInterval(intervalRef.current);
      if (!isCatchUp) playSound(cooldownPlayer);
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
        else if (e.type === 'warmup_start')   playSound(warmupPlayer);
        else if (e.type === 'cooldown_start') playSound(cooldownPlayer);
        else if (e.type === 'warning')        playSound(warningPlayer);
        else if (e.type === 'countdown')      playSound(countdownPlayer);
      }
    }

    lastEventElapsedRef.current = current;
    setElapsed(current);
  }, [
    events, totalDuration, vibrationEnabled,
    pingPlayer, doublePlayer, doubleRestPlayer, warmupPlayer, cooldownPlayer, warningPlayer, countdownPlayer,
    playSound, queuePingCue,
  ]);
  tickRef.current = tick;

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
      // Resuming at the start of a phase (e.g. after jumping phases while paused)
      // plays that phase's start sound, deferred from the silent paused jump.
      if (elapsed === currentPhase.start) {
        playSound(playerForPhaseType(currentPhase.type));
        // Stops the first tick playing it again.
        lastEventElapsedRef.current = elapsed;
      }
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
    if (isRunning) {
      startTimeRef.current = Date.now();
      playSound(playerForPhaseType(targetPhase.type));
    }
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
          <Text maxFontSizeMultiplier={2} style={[styles.topBarIcon, { color: fgColor }]}>✕</Text>
        </TouchableOpacity>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.phaseLabel, { color: fgColor }]}>{currentPhase.label}</Text>
        <View style={styles.hitSlop} />
      </View>

      {/* Large countdown */}
      <View style={styles.timerBlock}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.timerText, { color: fgColor }]}>
          {formatTime(phaseRemaining)}
        </Text>
      </View>

      {/* Round info */}
      <View style={styles.roundBlock}>
        <TouchableOpacity onPress={handlePrevPhase} hitSlop={styles.hitSlop}>
          <Text maxFontSizeMultiplier={2} style={[styles.arrowText, { color: fgColor }]}>‹</Text>
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
          <Text maxFontSizeMultiplier={2} style={[styles.arrowText, { color: fgColor }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Elapsed / Remaining */}
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statValue, { color: fgColor }]}>{formatElapsed(elapsed)}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statLabel, { color: fgColor, opacity: 0.6 }]}>Elapsed</Text>
        </View>
        <View style={styles.statBlock}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statValue, { color: fgColor }]}>{formatTime(totalRemaining)}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statLabel, { color: fgColor, opacity: 0.6 }]}>Remaining</Text>
        </View>
      </View>

      {/* Play/Pause */}
      <View style={styles.controlsBlock}>
        <TouchableOpacity
          style={[styles.playButton, { borderColor: fgColor, opacity: isDone ? 0.4 : 1 }]}
          onPress={handleStartPause}
          disabled={isDone}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.playButtonText, { color: fgColor }]}>
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
    minWidth: 32,
  },
  phaseLabel: {
    flex: 1,
    textAlign: 'center',
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
    paddingHorizontal: 16,
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
    flexShrink: 1,
  },
  roundText: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingVertical: 16,
    gap: 16,
  },
  statBlock: {
    alignItems: 'center',
    flexShrink: 1,
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
