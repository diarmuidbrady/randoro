export const PHASE_COLORS = {
  warmup:   { background: '#F59E0B', text: '#FFFFFF' },
  work:     { background: '#EF4444', text: '#FFFFFF' },
  rest:     { background: '#22C55E', text: '#FFFFFF' },
  cooldown: { background: '#3B82F6', text: '#FFFFFF' },
  idle:     { background: '#1C1C1E', text: '#FFFFFF' },
  done:     { background: '#1C1C1E', text: '#FFFFFF' },
};

// Intensity controls avg seconds between pings.
export const INTENSITY_MAP = { Low: 7, Medium: 5, High: 3 };
export const INTENSITY_LABELS = ['Low', 'Medium', 'High'];

// Combo controls minimum gap between consecutive pings.
export const COMBO_MAP = { Single: 1, Combination: 2.5, Extended: 4 };
export const COMBO_LABELS = ['Single', 'Combination', 'Extended'];

export const SOUND_OPTIONS = ['ping', 'bell', 'beep', 'double'];
