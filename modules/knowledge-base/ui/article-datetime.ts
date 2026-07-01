const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Relative labels for ~7 days; older list rows use a long calendar date. */
const KB_LIST_DATE_RELATIVE_MAX_MS = 7 * DAY_MS;

/** Locale-aware relative time (e.g. "3 minutes ago" / "vor 3 Minuten"). */
export function formatKbRelativeTime(iso: string, locale?: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) {
    return iso;
  }
  const delta = timestamp - Date.now();
  const abs = Math.abs(delta);
  const loc = locale && locale.length > 0 ? locale : undefined;
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
  if (abs < MINUTE_MS) {
    return rtf.format(Math.round(delta / SECOND_MS), "second");
  }
  if (abs < HOUR_MS) {
    return rtf.format(Math.round(delta / MINUTE_MS), "minute");
  }
  if (abs < DAY_MS) {
    return rtf.format(Math.round(delta / HOUR_MS), "hour");
  }
  return rtf.format(Math.round(delta / DAY_MS), "day");
}

/** Calendar date only — human-readable (e.g. "1. September 2021" / "September 1, 2021"). */
export function formatKbDate(value: string, locale?: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const d = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
        12,
        0,
        0
      )
    : new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  const loc = locale && locale.length > 0 ? locale : undefined;
  return new Intl.DateTimeFormat(loc, { dateStyle: "long" }).format(d);
}

/** Short date + time in user locale. */
export function formatKbDateTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const loc = locale && locale.length > 0 ? locale : undefined;
  return new Intl.DateTimeFormat(loc, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

/** Hub / category flat lists — relative when recent, long date when older. */
export function formatKbListDate(
  iso: string,
  locale?: string
): { label: string; title: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { label: iso, title: iso };
  }
  const title = formatKbDateTime(iso, locale);
  const ageMs = Math.abs(d.getTime() - Date.now());
  if (ageMs <= KB_LIST_DATE_RELATIVE_MAX_MS) {
    return { label: formatKbRelativeTime(iso, locale), title };
  }
  const loc = locale && locale.length > 0 ? locale : undefined;
  return {
    label: new Intl.DateTimeFormat(loc, { dateStyle: "long" }).format(d),
    title,
  };
}
