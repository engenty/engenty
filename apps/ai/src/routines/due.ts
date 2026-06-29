// Due computation for routines: a routine is due when the most recent
// scheduled occurrence (UTC) is after its last recorded run, and `now` is
// not inside the quiet-hours window.
import type { RoutineDefinition } from "@engenty/ai-core";
import { CronExpressionParser } from "cron-parser";

export interface RoutineDueState {
  enabled: boolean;
  last_run_at: string | null;
  schedule_override: string | null;
}

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

export function isRoutineDue(
  definition: RoutineDefinition,
  state: RoutineDueState | null,
  now: Date,
  schedules?: string[]
): boolean {
  const enabled = state ? state.enabled : definition.enabled_by_default;
  if (!enabled) {
    return false;
  }
  if (
    definition.quiet_hours &&
    isWithinQuietHours(definition.quiet_hours, now)
  ) {
    return false;
  }

  const activeSchedules = state?.schedule_override?.trim()
    ? [state.schedule_override.trim()]
    : schedules && schedules.length > 0
      ? schedules
      : [definition.schedule];

  const lastRunAt = state?.last_run_at ? new Date(state.last_run_at) : null;

  for (const schedule of activeSchedules) {
    if (!schedule?.trim()) {
      continue;
    }
    try {
      const expression = CronExpressionParser.parse(schedule, {
        currentDate: now,
        tz: "UTC",
      });
      const lastScheduled = expression.prev().toDate();
      if (!lastRunAt || lastScheduled.getTime() > lastRunAt.getTime()) {
        return true;
      }
    } catch {
      // Invalid cron (e.g. bad override) → never due; surfaced via last_result
      // when the admin sets the override, not by crashing the tick.
    }
  }

  return false;
}

/**
 * Cron due check for system jobs (cleanup, heartbeat) — they share the tick +
 * `ai.routine_state` but are not routines, so they carry no RoutineDefinition.
 */
export function isScheduleDue(
  schedules: string[],
  quietHours: string | null | undefined,
  lastRunAt: string | null,
  now: Date
): boolean {
  if (quietHours && isWithinQuietHours(quietHours, now)) {
    return false;
  }
  const last = lastRunAt ? new Date(lastRunAt) : null;
  for (const schedule of schedules) {
    if (!schedule?.trim()) {
      continue;
    }
    try {
      const expression = CronExpressionParser.parse(schedule, {
        currentDate: now,
        tz: "UTC",
      });
      const lastScheduled = expression.prev().toDate();
      if (!last || lastScheduled.getTime() > last.getTime()) {
        return true;
      }
    } catch {
      // Invalid cron → never due.
    }
  }
  return false;
}

export function getNextDueAt(
  schedule: string | string[],
  now: Date
): string | null {
  const schedules = Array.isArray(schedule) ? schedule : [schedule];
  let minNext: Date | null = null;
  for (const s of schedules) {
    if (!s?.trim()) {
      continue;
    }
    try {
      const expression = CronExpressionParser.parse(s, {
        currentDate: now,
        tz: "UTC",
      });
      const nextDate = expression.next().toDate();
      if (!minNext || nextDate < minNext) {
        minNext = nextDate;
      }
    } catch {
      // Invalid cron
    }
  }
  return minNext ? minNext.toISOString() : null;
}
