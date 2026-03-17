/**
 * Generates random ping times within a single work round.
 *
 * @param {number} workDuration - Total round duration in seconds
 * @param {number} n            - Number of pings to generate
 * @param {number} minGap       - Minimum seconds between consecutive pings
 * @returns {number[]}          - Ping times relative to round start (seconds)
 */
function generatePingTimes(workDuration, n, minGap) {
  if (n < 1 || minGap < 0 || workDuration < n * minGap) return [];

  if (workDuration === n * minGap) {
    return Array.from({ length: n }, (_, i) => (i + 1) * minGap);
  }

  const excessTime = workDuration - n * minGap;

  const randoms = Array.from({ length: n }, () => Math.random() * excessTime);
  const total = randoms.reduce((sum, r) => sum + r, 0);
  const normalized = randoms.map(r => (r * excessTime) / total);

  const pingTimes = [];
  let cumulative = 0;
  for (let i = 0; i < n; i++) {
    cumulative += normalized[i] + (i > 0 ? minGap : 0);
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
 * @param {number} config.avgFrequency  - Average seconds between pings
 * @param {number} config.minGap        - Minimum seconds between pings
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
  } = config;

  const n = Math.max(1, Math.floor(workDuration / (avgFrequency + minGap)));
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
    const pingTimes = generatePingTimes(workDuration, n, minGap);
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

  events.sort((a, b) => a.time - b.time);

  return { events, phases, totalDuration: t };
}
