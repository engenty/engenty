import { riverTimeZone } from "../river/time-zone.js";

/**
 * The run's "now", in the deployment's time zone. Every run carries it so an
 * agent never has to run `date` in a shell — which a business user would be
 * asked to approve — to know what "today" or "yesterday" means.
 */
export function formatRunClock(now: Date = new Date()): string {
  const timeZone = riverTimeZone();
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    weekday: "long",
    year: "numeric",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `- now: ${part("weekday")} ${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")} (${timeZone})`;
}
