/** Format an elapsed duration (seconds) as a compact "30s" / "1m 5s" / "1h 2m" label. */
export function formatElapsedSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) {
    return `${s}s`;
  }
  const minutes = Math.floor(s / 60);
  if (minutes < 60) {
    const rem = s % 60;
    return rem === 0 ? `${minutes}m` : `${minutes}m ${rem}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
}
