import { LEVELS, LEVEL_KEYS } from '../constants/theme';
import { avgWaitFor, maxPings, pingsForWait } from './generator';

export const WAIT_MIN = 1;
export const WAIT_MAX = 30;
export const WAIT_STEP = 0.5;
export const THIRDS = 3;

export const levelWait = (key) => LEVELS[key].wait;

export const nextLevel = (key) => LEVEL_KEYS[(LEVEL_KEYS.indexOf(key) + 1) % LEVEL_KEYS.length];

// The level whose wait is closest to a wait in seconds.
export const nearestLevel = (wait) =>
  LEVEL_KEYS.reduce((best, key) =>
    Math.abs(levelWait(key) - wait) < Math.abs(levelWait(best) - wait) ? key : best
  );

export const roundToStep = (wait) => Math.round(wait / WAIT_STEP) * WAIT_STEP;
export const clampWait = (wait) => Math.min(WAIT_MAX, Math.max(WAIT_MIN, wait));
export const formatWait = (wait) => `${wait.toFixed(1)} s`;

// A per-round list fitted to the number of rounds: extra entries are kept in
// storage but ignored, and missing ones take the fallback.
export function fitRounds(list, rounds, fallback) {
  return Array.from({ length: rounds }, (_, i) => list[i] ?? fallback);
}

// ── Patterns: set every round's level at once ───────────────
const LEVEL_AT = ['L', 'M', 'H'];

function buildUp(n) {
  if (n < 2) return Array(n).fill('L');
  return Array.from({ length: n }, (_, i) => LEVEL_AT[Math.round((2 * i) / (n - 1))]);
}

export const PATTERNS = [
  {
    name: 'Competition',
    minRounds: 3,
    levels: (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 'H' : 'M')),
  },
  {
    name: 'Build up',
    minRounds: 3,
    levels: buildUp,
  },
  {
    name: 'Pyramid',
    minRounds: 3,
    levels: (n) => {
      const up = buildUp(Math.ceil(n / 2));
      return [...up, ...up.slice(0, Math.floor(n / 2)).reverse()];
    },
  },
];

// ── Manual: avg. wait and beeps per round, linked ───────────
// An entry is { wait, beeps, by }: `by` is whichever the user set last, and
// the other is worked out from it for the round length and attack time.
export function resolveManual(entry, work, attack) {
  const max = Math.max(1, maxPings(work, attack));
  if (entry.by === 'beeps') {
    const beeps = Math.min(max, Math.max(1, entry.beeps));
    return { wait: Math.max(0, avgWaitFor(work, beeps, attack)), beeps, max };
  }
  return { wait: entry.wait, beeps: Math.min(max, pingsForWait(work, entry.wait, attack)), max };
}

export const manualFromWait = (wait) => ({ wait: clampWait(wait), beeps: 1, by: 'wait' });
export const manualFromBeeps = (beeps) => ({ wait: WAIT_MIN, beeps, by: 'beeps' });

// The plan for one round: the segments it's split into and how dense each is.
// A segment is { wait } or { beeps }.
export function roundPlan(config, roundIndex, work, attack) {
  const rounds = parseInt(config.rounds) || 1;
  const preset = config.intensityMode === 'Preset';

  if (config.scope === 'WithinRound') {
    return preset
      ? config.thirdLevels.map((key) => ({ wait: levelWait(key) }))
      : config.thirdWaits.map((wait) => ({ wait }));
  }

  if (preset) {
    const level = config.scope === 'PerRound'
      ? fitRounds(config.roundLevels, rounds, config.level)[roundIndex]
      : config.level;
    return [{ wait: levelWait(level) }];
  }

  const entry = config.scope === 'PerRound'
    ? fitRounds(config.roundManual, rounds, config.manual)[roundIndex]
    : config.manual;
  const { wait, beeps } = resolveManual(entry, work, attack);
  return [entry.by === 'beeps' ? { beeps } : { wait }];
}

// Moving between Preset and Manual carries the intensity over.
export function presetToManual(config) {
  return {
    manual: manualFromWait(levelWait(config.level)),
    roundManual: config.roundLevels.map((key) => manualFromWait(levelWait(key))),
    thirdWaits: config.thirdLevels.map(levelWait),
  };
}

export function manualToPreset(config, work, attack) {
  const waitOf = (entry) => resolveManual(entry, work, attack).wait;
  return {
    level: nearestLevel(waitOf(config.manual)),
    roundLevels: config.roundManual.map((entry) => nearestLevel(waitOf(entry))),
    thirdLevels: config.thirdWaits.map(nearestLevel),
  };
}
