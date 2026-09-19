// Relative + absolute date formatting for session/activity rows.

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatRelativeDate(
  value: string | null,
  options?: { style?: Intl.RelativeTimeFormatStyle }
) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const delta = timestamp - Date.now();
  const absoluteDelta = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
    style: options?.style ?? "long",
  });

  if (absoluteDelta < MINUTE_MS) {
    return formatter.format(Math.round(delta / SECOND_MS), "second");
  }
  if (absoluteDelta < HOUR_MS) {
    return formatter.format(Math.round(delta / MINUTE_MS), "minute");
  }
  if (absoluteDelta < DAY_MS) {
    return formatter.format(Math.round(delta / HOUR_MS), "hour");
  }

  return formatter.format(Math.round(delta / DAY_MS), "day");
}

/** The compact form for a band or a chip: "vor 3 Min.", "3m ago". */
export function formatRelativeDateShort(value: string | null) {
  return formatRelativeDate(value, { style: "narrow" });
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
