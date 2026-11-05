// Every move takes the same time to throw, whether it's a punch, a defence or
// a movement. A call's attack time is its moves times this.
export const MOVE_SECONDS = 0.5;

// An empty custom combo counts as a 2-punch combo.
export const DEFAULT_MOVES = 2;

// Tapping a call cycles through these combo lengths.
export const COMBO_LENGTHS = [
  { label: '1–2 punches', moves: 2 },
  { label: '3–4 punches', moves: 4 },
  { label: '5–6+ punches', moves: 6 },
];

export const MAX_CALLS = 3;
export const BETWEEN_BEEPS_MAX = 40;

// A starting list to pick from in the custom combo box.
export const PRESET_COMBOS = [
  '1-2',
  '1-1-2',
  '1-2-3',
  '1-2-3-2',
  '2-3-2',
  '1-6-3-2',
  '1-2, slip, 2',
  'jab, slip, jab',
  'head, body, head',
  '1-2, roll, 3-2',
  '3, 2, pivot, 3',
  'jab, cross, slip, cross, hook',
];

// Commas and dashes (including the en and em dashes autocorrect makes) split moves.
export function parseCombo(text) {
  return (text ?? '').split(/[,\-–—]/).map(s => s.trim()).filter(Boolean);
}

export function moveCount(call) {
  if (call.combo?.trim()) return parseCombo(call.combo).length || DEFAULT_MOVES;
  return COMBO_LENGTHS[call.length ?? 0]?.moves ?? DEFAULT_MOVES;
}

// Seconds the user gets to throw a call's combo after its beep.
export function attackTime(call) {
  return moveCount(call) * MOVE_SECONDS;
}

// One call is Classic; two or three are A, B, C in order. The key is the
// call's label in the generator and the name of its sound file.
export function callKey(index, count) {
  return count === 1 ? 'classic' : ['a', 'b', 'c'][index];
}
