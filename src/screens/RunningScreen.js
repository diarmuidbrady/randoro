import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { PHASE_COLORS, SOFT_FLASH_COLOR, CALL_RED } from '../constants/theme';
import { formatTime, formatElapsed } from '../utils/time';
import { parseCombo } from '../utils/combo';
import { CallShape, RandoroSymbol } from '../components/CallShape';

const TICK_MS = 100;
const FADE_DURATION_MS = 200;      // a call fades in and out over this; Minimal's pulse goes there and back
const MINIMAL_PULSE_OPACITY = 0.3; // Minimal: the timer's opacity at the pulse's peak
const CALL_TIMER_SCALE = 0.4;      // during a call the timer shrinks to this...
const CALL_TIMER_TOP = 4;          // ...and moves up to this far below the top bar
const CALL_SHAPE_MAX = 180;
const PING_UPDATE_MS = 20;    // how often the ping player reports its position while playing
const PING_FALLBACK_MS = 400; // flash anyway if the ping never reports playing
const SILENCE_HANDOVER_S = 3;

export default function RunningScreen({ route, navigation }) {
  const { workout, flashEnabled, flashStyle = 'Soft', vibrationEnabled, focusText = '' } = route.params;
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
  const flashAnim = useRef(new Animated.Value(0)).current; // Minimal's pulse
  // The call on screen, and its fade: 0 is the timer alone, 1 the call shown.
  const [call, setCall] = useState(null);
  const callAnim = useRef(new Animated.Value(0)).current;
  const callTimerRef = useRef(null);
  const [timerLayout, setTimerLayout] = useState(null);
  const [blockLayout, setBlockLayout] = useState(null);

  // ── Audio players (expo-audio) ────────────────────────────
  const playerOpts = { keepAudioSessionActive: true };
  // One player per call. Each call's label in the workout is its sound's file name.
  const callOpts = { ...playerOpts, updateInterval: PING_UPDATE_MS };
  const classicPlayer = useAudioPlayer(require('../../assets/sounds/classic.wav'), callOpts);
  const aPlayer       = useAudioPlayer(require('../../assets/sounds/a.wav'), callOpts);
  const bPlayer       = useAudioPlayer(require('../../assets/sounds/b.wav'), callOpts);
  const cPlayer       = useAudioPlayer(require('../../assets/sounds/c.wav'), callOpts);
  const callPlayers = useMemo(
    () => ({ classic: classicPlayer, a: aPlayer, b: bPlayer, c: cPlayer }),
    [classicPlayer, aPlayer, bPlayer, cPlayer],
  );
  const doublePlayer     = useAudioPlayer(require('../../assets/sounds/double.wav'), playerOpts);
  const doubleRestPlayer = useAudioPlayer(require('../../assets/sounds/double_rest.wav'), playerOpts);
  const warmupPlayer     = useAudioPlayer(require('../../assets/sounds/warmup.wav'), playerOpts);
  const cooldownPlayer   = useAudioPlayer(require('../../assets/sounds/cooldown.wav'), playerOpts);
  const warningPlayer    = useAudioPlayer(require('../../assets/sounds/warning.wav'), playerOpts);
  const countdownPlayer  = useAudioPlayer(require('../../assets/sounds/countdown.wav'), playerOpts);
  // A near-silent 110 Hz tone plays while this screen is open, alternating
  // between two players.
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

    // On Android the silence players' status updates drive the tick.
    const subs = Platform.OS === 'android'
      ? players.map((player, i) => player.addListener('playbackStatusUpdate', () => {
          if (i === activeSilenceRef.current) tickRef.current?.();
        }))
      : [];

    if (Platform.OS === 'android') {
      classicPlayer.setActiveForLockScreen(true, { title: 'randoro', artist: 'Workout in progress' });
    }

    return () => {
      subs.forEach((s) => s.remove());
      if (Platform.OS === 'android') {
        try { classicPlayer.clearLockScreenControls(); } catch {}
      }
    };
  }, [isRunning, silenceA, silenceB, classicPlayer]);

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

  // Beeps in this work round, and how many have fired. A ping fires on the tick
  // that passes its time, so counting by elapsed matches what's been heard.
  const roundPingTimes = useMemo(() => (
    currentPhase.type === 'work'
      ? events.filter(e => e.type === 'ping' && e.time >= currentPhase.start && e.time < currentPhase.end).map(e => e.time)
      : []
  ), [events, currentPhase]);
  const roundPingsFired = roundPingTimes.filter(t => t <= elapsed).length;

  // ── Sound helper ──────────────────────────────────────────
  const playSound = useCallback(async (player) => {
    try {
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

  // ── Call display ──────────────────────────────────────────
  // A call fades in over FADE_DURATION_MS: the timer shrinks and moves up, and
  // the call's shape shows in the middle. It stays for the call's attack time,
  // then fades out. Soft fades the background to pink with it and Sharp swaps
  // the colours for that time; Minimal pulses the timer and leaves the
  // background still.
  const sharpFlash = flashEnabled && flashStyle === 'Sharp';

  const hideCall = useCallback(() => {
    clearTimeout(callTimerRef.current);
    callAnim.stopAnimation();
    callAnim.setValue(0);
    setCall(null);
    setIsFlashing(false);
  }, [callAnim]);

  const showCall = useCallback((event) => {
    clearTimeout(callTimerRef.current);
    setCall(event);
    if (sharpFlash) setIsFlashing(true);
    if (flashEnabled && flashStyle === 'Minimal') {
      const half = FADE_DURATION_MS / 2;
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: half, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: half, useNativeDriver: true }),
      ]).start();
    }
    Animated.timing(callAnim, { toValue: 1, duration: FADE_DURATION_MS, useNativeDriver: true }).start();
    callTimerRef.current = setTimeout(() => {
      setIsFlashing(false);
      Animated.timing(callAnim, { toValue: 0, duration: FADE_DURATION_MS, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setCall(null); });
    }, (event.attack ?? 1) * 1000);
  }, [sharpFlash, flashEnabled, flashStyle, flashAnim, callAnim]);

  useEffect(() => () => clearTimeout(callTimerRef.current), []);

  // ── Call display + haptic, in step with the sound ─────────
  // They fire once the call's sound starts moving.
  const pingCueRef = useRef(null); // { event, timer } while a ping cue is pending

  const firePingCue = useCallback(() => {
    const cue = pingCueRef.current;
    if (!cue) return;
    clearTimeout(cue.timer);
    pingCueRef.current = null;
    if (vibrationEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    showCall(cue.event);
  }, [vibrationEnabled, showCall]);

  const queuePingCue = useCallback((event) => {
    clearTimeout(pingCueRef.current?.timer);
    pingCueRef.current = { event, timer: setTimeout(firePingCue, PING_FALLBACK_MS) };
  }, [firePingCue]);

  useEffect(() => {
    const subs = Object.entries(callPlayers).map(([key, player]) =>
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.playing && status.currentTime > 0 && pingCueRef.current?.event.call === key) {
          firePingCue();
        }
      })
    );
    return () => {
      subs.forEach((s) => s.remove());
      clearTimeout(pingCueRef.current?.timer);
    };
  }, [callPlayers, firePingCue]);

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
      const ping = pingsToFire[pingsToFire.length - 1];
      const event = { ...ping, call: callPlayers[ping.call] ? ping.call : 'classic' };
      playSound(callPlayers[event.call]);
      queuePingCue(event);
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
    callPlayers, doublePlayer, doubleRestPlayer, warmupPlayer, cooldownPlayer, warningPlayer, countdownPlayer,
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
    clearTimeout(pingCueRef.current?.timer);
    pingCueRef.current = null;
    hideCall();
    if (isRunning) {
      startTimeRef.current = Date.now();
      playSound(playerForPhaseType(targetPhase.type));
    }
  }, [phases, isRunning, playSound, playerForPhaseType, hideCall]);

  const currentPhaseIndex = phases.indexOf(currentPhase);
  const handlePrevPhase = () => jumpToPhaseIndex(currentPhaseIndex - 1);
  const handleNextPhase = () => jumpToPhaseIndex(currentPhaseIndex + 1);

  // ── Colours: invert on a Sharp flash ──────────────────────
  const bgColor = isFlashing ? phaseColors.text : phaseColors.background;
  const fgColor = isFlashing ? phaseColors.background : phaseColors.text;
  const timerOpacity = flashEnabled && flashStyle === 'Minimal'
    ? flashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, MINIMAL_PULSE_OPACITY] })
    : 1;
  const softFlash = flashEnabled && flashStyle === 'Soft';

  // The shape is red on Soft's pink and Sharp's white, and white on the red
  // background otherwise.
  const lightCall = softFlash || sharpFlash;
  const shapeColor = lightCall ? CALL_RED : phaseColors.text;
  const letterColor = lightCall ? '#FFFFFF' : CALL_RED;

  // During a call the timer shrinks and moves up to sit just below the top bar.
  const timerShift = timerLayout
    ? timerLayout.y + timerLayout.height / 2 - (CALL_TIMER_TOP + (timerLayout.height * CALL_TIMER_SCALE) / 2)
    : 0;
  const timerTransform = [
    { translateY: callAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -timerShift] }) },
    { scale: callAnim.interpolate({ inputRange: [0, 1], outputRange: [1, CALL_TIMER_SCALE] }) },
  ];
  const shapeSize = blockLayout ? Math.min(CALL_SHAPE_MAX, blockLayout.height * 0.45, blockLayout.width * 0.5) : 0;
  const focusVisible = currentPhase.type === 'work' && focusText.length > 0;
  const callMoves = call?.combo ? parseCombo(call.combo) : [];

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Soft: a pink layer behind the content fades in and out. The native
          driver animates opacity but not backgroundColor. */}
      {softFlash && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: SOFT_FLASH_COLOR, opacity: callAnim }]}
        />
      )}
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="light-content" />

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleStop} hitSlop={styles.hitSlop}>
            <Text maxFontSizeMultiplier={2} style={[styles.topBarIcon, { color: fgColor }]}>✕</Text>
          </TouchableOpacity>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.phaseLabel, { color: fgColor }]}>{currentPhase.label}</Text>
          <View style={styles.hitSlop} />
        </View>

        {/* Large countdown, with the focus text under it and the call over it */}
        <View style={styles.timerBlock} onLayout={(e) => setBlockLayout(e.nativeEvent.layout)}>
          <Animated.View
            style={{ opacity: timerOpacity, transform: timerTransform }}
            onLayout={(e) => setTimerLayout(e.nativeEvent.layout)}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.timerText, { color: fgColor }]}>
              {formatTime(phaseRemaining)}
            </Text>
          </Animated.View>
          {/* Between beeps (or Focus without beeps) shows in work rounds while
              no call is on screen. It keeps its space in other phases so the
              timer doesn't jump. */}
          {focusText.length > 0 && (
            <Animated.Text
              numberOfLines={2}
              maxFontSizeMultiplier={1.5}
              style={[
                styles.focusText,
                { color: fgColor, opacity: focusVisible ? callAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 0 },
              ]}
            >
              {focusText}
            </Animated.Text>
          )}
          {call && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.callOverlay,
                {
                  opacity: callAnim,
                  transform: [{ scale: callAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
                },
              ]}
            >
              {call.call === 'classic'
                ? <RandoroSymbol width={shapeSize * 1.5} color={shapeColor} />
                : <CallShape call={call.call} size={shapeSize} color={shapeColor} letterColor={letterColor} />}
              {callMoves.length > 0 && (
                <Text numberOfLines={2} maxFontSizeMultiplier={1.5} style={[styles.callCombo, { color: shapeColor }]}>
                  {callMoves.join(' · ')}
                </Text>
              )}
            </Animated.View>
          )}
        </View>

        {/* Round info */}
        <View style={styles.roundBlock}>
          <TouchableOpacity onPress={handlePrevPhase} hitSlop={styles.hitSlop}>
            <Text maxFontSizeMultiplier={2} style={[styles.arrowText, { color: fgColor }]}>‹</Text>
          </TouchableOpacity>
          <View style={styles.roundInfo}>
            {currentPhase.type === 'work' ? (
              <>
                <Text style={[styles.roundText, { color: fgColor }]}>
                  Round {currentPhase.round} of {currentRoundCount}
                </Text>
                {roundPingTimes.length > 0 && (
                  <Text style={[styles.beepCountText, { color: fgColor }]}>
                    {roundPingsFired} of {roundPingTimes.length} {roundPingTimes.length === 1 ? 'beep' : 'beeps'}
                  </Text>
                )}
              </>
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
  focusText: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  callOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 48,
  },
  callCombo: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 16,
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
  beepCountText: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    opacity: 0.7,
    marginTop: 2,
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
