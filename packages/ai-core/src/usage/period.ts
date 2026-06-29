import type {
  TenantUsagePolicyRecord,
  UsagePeriodMode,
  UsagePeriodUnit,
} from "./contracts.js";

/** A half-open period [start, end) used for limit checks and rollups. */
export interface ResolvedPeriod {
  period_end: string;
  period_start: string;
}

/** Internal helper: one rolling day in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/** Monday-anchored week start in UTC (ISO week). */
function startOfUtcWeek(now: Date): Date {
  const day = startOfUtcDay(now);
  // getUTCDay returns 0 (Sun) - 6 (Sat); shift so Monday=0 ... Sunday=6.
  const isoIndex = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - isoIndex * DAY_MS);
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function addUnit(start: Date, unit: UsagePeriodUnit): Date {
  if (unit === "day") {
    return new Date(start.getTime() + DAY_MS);
  }
  if (unit === "week") {
    return new Date(start.getTime() + 7 * DAY_MS);
  }
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

function rollingWindowDays(unit: UsagePeriodUnit): number {
  if (unit === "day") {
    return 1;
  }
  if (unit === "week") {
    return 7;
  }
  return 30;
}

/**
 * Resolve the active billing period for the given policy and reference time.
 *
 * - `calendar` snaps to UTC day/week/month boundaries (start-of-period to next-of-period).
 * - `rolling` walks `period_anchor` forward by `period_unit` until the current window contains `now`,
 *   so reset dates stay stable across calls. Without an anchor the window is `[now - unit, now)`.
 */
export function resolveCurrentPeriod(
  policy: Pick<
    TenantUsagePolicyRecord,
    "period_mode" | "period_unit" | "period_anchor"
  >,
  now: Date = new Date()
): ResolvedPeriod {
  const mode: UsagePeriodMode = policy.period_mode ?? "calendar";
  const unit: UsagePeriodUnit = policy.period_unit ?? "month";

  if (mode === "calendar") {
    const start =
      unit === "day"
        ? startOfUtcDay(now)
        : unit === "week"
          ? startOfUtcWeek(now)
          : startOfUtcMonth(now);
    const end = addUnit(start, unit);
    return {
      period_start: start.toISOString(),
      period_end: end.toISOString(),
    };
  }

  // Rolling: anchor-based window so resets stay deterministic.
  const windowDays = rollingWindowDays(unit);
  if (policy.period_anchor) {
    const anchor = new Date(policy.period_anchor);
    if (Number.isNaN(anchor.getTime())) {
      const end = now;
      const start = new Date(end.getTime() - windowDays * DAY_MS);
      return {
        period_start: start.toISOString(),
        period_end: end.toISOString(),
      };
    }
    let start = anchor;
    let end = new Date(start.getTime() + windowDays * DAY_MS);
    while (end.getTime() <= now.getTime()) {
      start = end;
      end = new Date(start.getTime() + windowDays * DAY_MS);
    }
    return {
      period_start: start.toISOString(),
      period_end: end.toISOString(),
    };
  }

  const end = now;
  const start = new Date(end.getTime() - windowDays * DAY_MS);
  return {
    period_start: start.toISOString(),
    period_end: end.toISOString(),
  };
}
