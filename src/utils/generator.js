// Beeps before a work round: a 10 s warning, then 3-2-1.
const COUNTDOWN_BEEPS = [
  { secondsOut: 10, type: 'warning' },
  { secondsOut: 3,  type: 'countdown' },
  { secondsOut: 2,  type: 'countdown' },
  { secondsOut: 1,  type: 'countdown' },
];

// Lowest average wait a round can be packed to, so the pings never fall into
// an even rhythm.
const MIN_AVG_WAIT = 1;

// How many pings a round gets for an average wait and combo time.
// Rounding down means the real average wait lands a little under avgWait.
export function pingsForWait(workDuration, avgWait, comboTime) {
  return Math.max(1, Math.floor(workDuration / (avgWait + comboTime)));
}

// Each of the n + 1 gaps is comboTime + wait, so n pings need
// (n + 1) × (comboTime + MIN_AVG_WAIT) ≤ workDuration.
export function maxPings(workDuration, comboTime) {
  return Math.floor(workDuration / (comboTime + MIN_AVG_WAIT)) - 1;
}

// Average wait per gap when a round holds n pings.
export function avgWaitFor(workDuration, n, comboTime) {
  return workDuration / (n + 1) - comboTime;
}

/**
 * Generates random ping times within a single work round.
 *
 * @param {number} workDuration - Total round duration in seconds
 * @param {number} n            - Number of pings to generate
 * @param {number} minGap       - Combo (execution) seconds, the fixed part of each gap
 * @returns {number[]}          - Ping times relative to round start (seconds)
 */
function generatePingTimes(workDuration, n, minGap) {
  // n pings make n + 1 gaps: round start → first ping, between pings, and
  // last ping → round end. Each gap is minGap plus a random share of the time
  // left over (the wait), so no ping lands on the round start or round end sounds.
  const gaps = n + 1;
  if (n < 1 || minGap < 0 || workDuration < gaps * minGap) return [];

  if (workDuration === gaps * minGap) {
    return Array.from({ length: n }, (_, i) => (i + 1) * minGap);
  }

  const excessTime = workDuration - gaps * minGap;

  const randoms = Array.from({ length: gaps }, () => Math.random());
  const total = randoms.reduce((sum, r) => sum + r, 0);
  const normalized = randoms.map(r => (r * excessTime) / total);

  const pingTimes = [];
  let cumulative = 0;
  for (let i = 0; i < n; i++) {
    cumulative += minGap + normalized[i];
    pingTimes.push(cumulative);
  }

  return pingTimes;
}

/**
 * Generates the full workout schedule.
 *
 * @param {object} config
 * @param {number} config.warmup        - Warmup duration (seconds)
 * @param {number} config.rounds        - Number of rounds
 * @param {number} config.workDuration  - Work duration per round (seconds)
 * @param {number} config.restDuration  - Rest duration between rounds (seconds)
 * @param {boolean} config.restFirst    - If true, rest comes before each work round
 * @param {number} config.cooldown      - Cooldown duration (seconds)
 * @param {number} config.avgFrequency  - Average wait (anticipation) seconds per gap, on top of minGap
 * @param {number} config.minGap        - Combo (execution) seconds, the fixed part of each gap
 * @param {number} [config.pingCount]   - Pings per round; overrides the count from avgFrequency
 * @param {boolean} config.randomBeeps  - If false, no pings: a plain interval timer
 *
 * @returns {{ events: object[], phases: object[], totalDuration: number }}
 */
export function generateWorkout(config) {
  const {
    warmup = 0,
    rounds = 3,
    workDuration = 180,
    restDuration = 60,
    restFirst = false,
    cooldown = 0,
    avgFrequency = 5,
    minGap = 2,
    pingCount,
    randomBeeps = true,
  } = config;

  const n = pingCount ?? pingsForWait(workDuration, avgFrequency, minGap);
  const events = [];
  const phases = [];
  let t = 0;

  const addEvent = (type, extra = {}) => events.push({ time: t, type, ...extra });
  const addPhase = (type, duration, extra = {}) => {
    phases.push({ type, start: t, end: t + duration, ...extra });
    t += duration;
  };

  // Warmup
  if (warmup > 0) {
    addEvent('warmup_start');
    addPhase('warmup', warmup, { label: 'Warm Up' });
  }

  // Rounds
  for (let r = 1; r <= rounds; r++) {
    // Rest before work (restFirst=true: rest precedes every work round)
    if (restFirst && restDuration > 0) {
      addEvent('rest_start');
      addPhase('rest', restDuration, { label: 'Rest' });
      addEvent('rest_end');
    }

    // Work round
    addEvent('round_start', { round: r });
    const roundStart = t;
    const pingTimes = randomBeeps ? generatePingTimes(workDuration, n, minGap) : [];
    phases.push({ type: 'work', start: t, end: t + workDuration, round: r, label: `Round ${r}` });
    pingTimes.forEach(pt => {
      events.push({ time: roundStart + pt, type: 'ping', round: r });
    });
    t += workDuration;
    addEvent('round_end', { round: r });

    // Rest after work (restFirst=false: rest follows each work round except the last)
    if (!restFirst && r < rounds && restDuration > 0) {
      addEvent('rest_start');
      addPhase('rest', restDuration, { label: 'Rest' });
      addEvent('rest_end');
    }
  }

  // Cooldown
  if (cooldown > 0) {
    addEvent('cooldown_start');
    addPhase('cooldown', cooldown, { label: 'Cool Down' });
  }

  addEvent('done');
  phases.push({ type: 'done', start: t, end: t, label: 'Done' });

  // Countdown into each work round, played in the phase before it. Beeps at or
  // before that phase's start are dropped so they don't land on its start
  // sound, and back-to-back work rounds get none so they don't mix with pings.
  phases.forEach((phase, i) => {
    const prev = phases[i - 1];
    if (phase.type !== 'work' || !prev || prev.type === 'work') return;
    for (const { secondsOut, type } of COUNTDOWN_BEEPS) {
      const time = phase.start - secondsOut;
      if (time > prev.start) events.push({ time, type });
    }
  });

  events.sort((a, b) => a.time - b.time);

  return { events, phases, totalDuration: t };
}
