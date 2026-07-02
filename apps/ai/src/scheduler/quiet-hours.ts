/** Returns true when `now` (UTC) falls inside an "HH:MM-HH:MM" window. Supports midnight wrap. */
export function isWithinQuietHours(quietHours: string, now: Date): boolean {
  const [start, end] = quietHours.split("-");
  const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const startMin = minutesOf(start);
  const endMin = minutesOf(end);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Window wraps midnight, e.g. 22:00-06:00.
  return nowMin >= startMin || nowMin < endMin;
}
