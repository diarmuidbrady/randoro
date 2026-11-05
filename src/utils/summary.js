// One-line summaries of the setup sections, shown when a section is collapsed.
import { LEVELS } from '../constants/theme';
import { parseSeconds } from './time';
import { COMBO_LENGTHS, parseCombo, callKey } from './combo';
import { fitRounds, resolveManual } from './intensity';

// 45 s, 3:00, 12:30
export function shortTime(seconds) {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function structureSummary(config) {
  const rounds = parseInt(config.rounds) || 1;
  const work = parseSeconds(config.workDuration);
  const rest = parseSeconds(config.restDuration);
  const rests = config.restFirst ? rounds : rounds - 1;
  const total = parseSeconds(config.warmup) + rounds * work + rests * rest + parseSeconds(config.cooldown);
  const restPart = rest > 0 ? ` · ${shortTime(rest)} rest${config.restFirst ? ' first' : ''}` : '';
  return `${rounds} × ${shortTime(work)} work${restPart} · ${shortTime(total)} total`;
}

function callSummary(call, i, count) {
  const key = callKey(i, count);
  const label = key === 'classic' ? 'Classic' : key.toUpperCase();
  const moves = parseCombo(call.combo);
  return `${label}: ${moves.length > 0 ? moves.join('-') : COMBO_LENGTHS[call.length].label}`;
}

export function focusSummary(config) {
  const calls = config.calls.map((c, i) => callSummary(c, i, config.calls.length)).join(' · ');
  const between = config.betweenBeeps.trim();
  return between ? `${calls} · Between: ${between}` : calls;
}

export function intensitySummary(config, work, attack) {
  const rounds = parseInt(config.rounds) || 1;
  if (config.intensityMode === 'Preset') {
    if (config.scope === 'PerRound') return `Preset per round · ${fitRounds(config.roundLevels, rounds, config.level).join(' ')}`;
    if (config.scope === 'WithinRound') return `Preset within round · ${config.thirdLevels.join(' ')}`;
    return `Preset · ${LEVELS[config.level].label}`;
  }
  const { wait, beeps } = resolveManual(config.manual, work, attack);
  return `Manual · ${wait.toFixed(1)} s avg. wait · ${beeps} calls per round`;
}

export function feedbackSummary(config) {
  const flash = config.flashEnabled ? `${config.flashStyle} flash` : 'No flash';
  return `${flash} · ${config.vibrationEnabled ? 'Vibration' : 'No vibration'}`;
}

export function beepsSummary(config, work, attack) {
  if (!config.randomBeeps) return 'Off · a plain interval timer';
  const calls = config.calls.length === 1 ? 'Classic' : config.calls.map((_, i) => callKey(i, config.calls.length).toUpperCase()).join(', ');
  return `${calls} · ${intensitySummary(config, work, attack)} · ${feedbackSummary(config)}`;
}
