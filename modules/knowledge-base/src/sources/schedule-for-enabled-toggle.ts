import type { KbSourceSchedule } from "../schema/sources.js";

/**
 * Builds a full schedule payload when toggling `enabled` so PATCH sends a valid
 * `schedule` object (DB replaces the whole JSON column).
 */
export function scheduleForEnabledToggle(
  current: KbSourceSchedule,
  enabled: boolean,
  fallbackIntervalMinutes: number
): KbSourceSchedule {
  const tz = current.timezone ?? "UTC";
  if (!enabled) {
    return { ...current, enabled: false, timezone: tz };
  }
  if (current.kind === "cron") {
    const expr = current.cron_expression?.trim() ?? "";
    if (expr) {
      return {
        ...current,
        cron_expression: expr,
        enabled: true,
        interval_minutes: null,
        kind: "cron",
        timezone: tz,
      };
    }
  }
  const raw =
    current.kind === "interval" && typeof current.interval_minutes === "number"
      ? current.interval_minutes
      : fallbackIntervalMinutes;
  const interval = Math.max(5, raw);
  return {
    ...current,
    cron_expression: null,
    enabled: true,
    interval_minutes: interval,
    kind: "interval",
    timezone: tz,
  };
}
