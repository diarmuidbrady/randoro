export const PHASE_COLORS = {
  warmup:   { background: '#F59E0B', text: '#FFFFFF' },
  work:     { background: '#EF4444', text: '#FFFFFF' },
  rest:     { background: '#22C55E', text: '#FFFFFF' },
  cooldown: { background: '#3B82F6', text: '#FFFFFF' },
  idle:     { background: '#1C1C1E', text: '#FFFFFF' },
  done:     { background: '#1C1C1E', text: '#FFFFFF' },
};

// Screen Flash styles on a beep. Soft fades the work red to pink and back,
// Sharp swaps the background and text colours, Minimal only pulses the timer.
export const FLASH_STYLES = ['Soft', 'Sharp', 'Minimal'];
export const SOFT_FLASH_COLOR = '#FECACA';

// Intensity levels. Each sets the average wait in seconds, the random part of
// each gap between beeps, on top of the call's attack time. The colour always
// comes with the letter, for colourblind users.
export const LEVELS = {
  L: { label: 'Low',    wait: 9, color: '#FACC15' },
  M: { label: 'Medium', wait: 6, color: '#FB923C' },
  H: { label: 'High',   wait: 3, color: '#EF4444' },
};
export const LEVEL_KEYS = ['L', 'M', 'H'];
export const LEVEL_TEXT_COLOR = '#111827';

// Calls A, B and C each have a shape, on the setup screen and the run screen.
export const CALL_SHAPES = { a: 'triangle', b: 'square', c: 'circle' };
export const CALL_RED = '#EF4444';

// Unchosen buttons on the setup screen sit in a light charcoal fill.
export const UNSELECTED_FILL = '#E6E8EC';
