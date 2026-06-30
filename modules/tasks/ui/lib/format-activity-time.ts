import { format } from "date-fns";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OLD_THRESHOLD_MS = 7 * DAY_MS;

export function formatActivityRelativeTime(
  iso: string,
  now = Date.now()
): { kind: "invalid" | "just_now" | "relative" | "absolute"; value: string } {
  const date = new Date(iso);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return { kind: "invalid", value: "—" };
  }

  const diffMs = Math.max(0, now - timestamp);
  if (diffMs < MINUTE_MS) {
    return { kind: "just_now", value: "" };
  }

  if (diffMs < OLD_THRESHOLD_MS) {
    const minutes = Math.round(diffMs / MINUTE_MS);
    if (minutes < 60) {
      return { kind: "relative", value: `${minutes}m` };
    }
    const hours = Math.round(minutes / 60);
    if (hours < 48) {
      return { kind: "relative", value: `${hours}h` };
    }
    const days = Math.round(hours / 24);
    return { kind: "relative", value: `${days}d` };
  }

  return { kind: "absolute", value: format(date, "MMM d, yyyy") };
}

export function formatActivityTimeLabel(
  iso: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  now = Date.now()
): string {
  const time = formatActivityRelativeTime(iso, now);
  if (time.kind === "just_now") {
    return t("detail.activityTimeJustNow");
  }
  if (time.kind === "relative") {
    return t("detail.activityTimeAgo", { value: time.value });
  }
  return time.value;
}
