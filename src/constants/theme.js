export const PHASE_COLORS = {
  warmup:   { background: '#F59E0B', text: '#FFFFFF' },
  work:     { background: '#EF4444', text: '#FFFFFF' },
  rest:     { background: '#22C55E', text: '#FFFFFF' },
  cooldown: { background: '#3B82F6', text: '#FFFFFF' },
  idle:     { background: '#1C1C1E', text: '#FFFFFF' },
  done:     { background: '#1C1C1E', text: '#FFFFFF' },
};

// Intensity controls avg seconds between pings.
export const INTENSITY_MAP = { Low: 9, Medium: 6, High: 3 };
export const INTENSITY_LABELS = ['Low', 'Medium', 'High'];

// Punches controls minimum gap between consecutive pings.
export const COMBO_MAP = { '1-2': 1, '3-4': 2, '5-6+': 3 };
export const COMBO_LABELS = ['1-2', '3-4', '5-6+'];
