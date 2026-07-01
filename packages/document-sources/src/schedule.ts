import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";
import type { DocumentSourceSchedule } from "./types.js";

export function normalizeDocumentSourceSchedule(
  raw: Partial<DocumentSourceSchedule>
): DocumentSourceSchedule {
  const kind =
    raw.kind === "cron" || raw.kind === "interval" ? raw.kind : "interval";
  const cronRaw = raw.cron_expression;
  const cron_expression =
    typeof cronRaw === "string" && cronRaw.trim() ? cronRaw.trim() : null;
  return {
    cron_expression,
    enabled: Boolean(raw.enabled),
    interval_minutes:
      typeof raw.interval_minutes === "number"
        ? raw.interval_minutes
        : raw.interval_minutes === null
          ? null
          : null,
    kind,
    timezone:
      typeof raw.timezone === "string" && raw.timezone.trim()
        ? raw.timezone.trim()
        : "UTC",
  };
}

export type CronValidationResult = { ok: true } | { ok: false; error: string };

/** Validate a 5-field cron (minute hour dom month dow) for use with `timezone` (IANA). */
export function validateDocumentSourceCronExpression(
  expression: string,
  timezone: string
): CronValidationResult {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { ok: false, error: "Cron expression is empty" };
  }
  try {
    CronExpressionParser.parse(trimmed, { tz: timezone || "UTC" });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/** English human summary; returns null if invalid. */
export function describeDocumentSourceCronExpression(
  expression: string,
  options?: { locale?: string }
): string | null {
  const trimmed = expression.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return cronstrue.toString(trimmed, {
      locale: options?.locale ?? "en",
      use24HourTimeFormat: true,
    });
  } catch {
    return null;
  }
}

/** Next ISO-8601 run instant, or null when scheduling is off or invalid. */
export function computeDocumentSourceNextRunAt(
  source: { schedule: DocumentSourceSchedule },
  from = new Date()
): string | null {
  const s = normalizeDocumentSourceSchedule(source.schedule);
  if (!s.enabled) {
    return null;
  }
  if (s.kind === "cron") {
    const expr = s.cron_expression?.trim();
    if (!expr) {
      return null;
    }
    try {
      const iterator = CronExpressionParser.parse(expr, {
        currentDate: from,
        tz: s.timezone || "UTC",
      });
      return iterator.next().toDate().toISOString();
    } catch {
      return null;
    }
  }
  const interval = s.interval_minutes;
  if (!(interval && interval >= 1)) {
    return null;
  }
  return new Date(from.getTime() + interval * 60_000).toISOString();
}
