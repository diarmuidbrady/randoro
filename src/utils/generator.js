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

// How many pings a round gets for an average wait and attack time.
// Rounding down means the real average wait lands a little under avgWait.
export function pingsForWait(workDuration, avgWait, attack) {
  return Math.max(1, Math.floor(workDuration / (avgWait + attack)));
}

// Each of the n + 1 gaps is attack + wait, so n pings need
// (n + 1) × (attack + MIN_AVG_WAIT) ≤ workDuration.
export function maxPings(workDuration, attack) {
  return Math.floor(workDuration / (attack + MIN_AVG_WAIT)) - 1;
}

// Average wait per gap when a round holds n pings.
export function avgWaitFor(workDuration, n, attack) {
  return workDuration / (n + 1) - attack;
}

// The average attack time over the beep types, used to work out how many
// pings fit before the random sequence of calls is known.
export function meanAttack(beepTypes) {
  return beepTypes.reduce((sum, b) => sum + b.attack, 0) / beepTypes.length;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Generates random pings within one stretch of a work round.
 *
 * n pings make n + 1 gaps: stretch start → first ping, between pings, and last
 * ping → stretch end. The gap after a ping holds that call's attack time, and
 * the first gap holds `lead`. Each gap also gets a random share of the time
 * left over (the wait), so no ping lands on the round start or end sounds and
 * every attack finishes before the next ping.
 *
 * @param {number} duration   - Stretch length in seconds
 * @param {number} n          - Number of pings wanted
 * @param {object[]} beepTypes - [{ label, attack, combo }] to draw calls from
 * @param {number} lead       - Fixed seconds before the first ping
 * @returns {{ time: number, beep: object }[]} - Times relative to the stretch start
 */
function generatePings(duration, n, beepTypes, lead) {
  const calls = Array.from({ length: Math.max(0, n) }, () => pick(beepTypes));
  const fixed = () => lead + calls.reduce((sum, c) => sum + c.attack, 0);
  // A run of long calls may not fit; drop calls until they do.
  while (calls.length > 0 && fixed() > duration) calls.pop();
  if (calls.length === 0) return [];

  const gaps = calls.length + 1;
  const excessTime = duration - fixed();
  const randoms = Array.from({ length: gaps }, () => Math.random());
  const total = randoms.reduce((sum, r) => sum + r, 0);
  const shares = randoms.map(r => (total > 0 ? (r * excessTime) / total : excessTime / gaps));

  const pings = [];
  let cumulative = 0;
  calls.forEach((beep, i) => {
    cumulative += (i === 0 ? lead : calls[i - 1].attack) + shares[i];
    pings.push({ time: cumulative, beep });
  });
  return pings;
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
 * @param {object[]} config.beepTypes   - [{ label, attack, combo }]: one (Classic) or
 *                                        several (A, B, C). Each label is its call's key in CALL_SOUNDS.
 * @param {object[][]} config.roundPlans - Per round, the equal segments it's split into,
 *                                        each { wait } (average wait, seconds) or { beeps }
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
    beepTypes = [{ label: 'classic', attack: 1, combo: '' }],
    roundPlans = [],
    randomBeeps = true,
  } = config;

  const attack = meanAttack(beepTypes);
  const events = [];
  const phases = [];
  let t = 0;

  const addEvent = (type, extra = {}) => events.push({ time: t, type, ...extra });
  const addPhase = (type, duration, extra = {}) => {
    phases.push({ type, start: t, end: t + duration, ...extra });
    t += duration;
  };

  // Pings for one round: each segment is filled on its own, so a round split
  // into thirds can run at three intensities.
  const roundPings = (plan) => {
    const segments = plan.length > 0 ? plan : [{ wait: 6 }];
    const length = workDuration / segments.length;
    return segments.flatMap((segment, i) => {
      const n = segment.beeps ?? pingsForWait(length, segment.wait, attack);
      // Only the round's first ping needs a lead; later segments follow on
      // from the previous segment's last attack.
      const lead = i === 0 ? attack : 0;
      return generatePings(length, n, beepTypes, lead)
        .map(p => ({ ...p, time: i * length + p.time }));
    });
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
    const pings = randomBeeps ? roundPings(roundPlans[r - 1] ?? []) : [];
    phases.push({ type: 'work', start: t, end: t + workDuration, round: r, label: `Round ${r}` });
    pings.forEach(({ time, beep }) => {
      events.push({
        time: roundStart + time,
        type: 'ping',
        round: r,
        call: beep.label,
        attack: beep.attack,
        combo: beep.combo,
      });
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
