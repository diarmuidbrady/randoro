// Countdown display — rounds UP so "1 second left" shows 0:01, not 0:00.
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Elapsed display — rounds DOWN so it matches real-world seconds.
export function formatElapsed(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function parseSeconds(value) {
  const minutes = parseFloat(value.minutes);
  const seconds = parseFloat(value.seconds);
  const totalSeconds = (isNaN(minutes) ? 0 : minutes * 60) + (isNaN(seconds) ? 0 : seconds);
  return totalSeconds < 0 ? 0 : totalSeconds;
}
