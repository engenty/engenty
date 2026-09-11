// The run's two contract fields, extracted from whatever its last step
// returned.
//
// `outcome` is the flow's own verdict on the WORK — a different plane from the
// engine's `completed | failed`. `reporting` is how loudly the result lands in
// the owner's chat. Both ride the run's declared output as plain keys, so a
// graph's final mapping (or a specialist under an output schema) states them
// like any other field; nothing here executes anything.
//
// Extraction is deliberately forgiving: a value outside the enum is dropped
// with a warning, never thrown — a model misspelling "partial" must not turn a
// completed run into a failed one. Dropped means null, and null means "the
// flow declared nothing", which is what every pre-contract run already is.
// Vocabulary: docs/content/dev/work-model.md → "Outcome and reporting".

export const RUN_OUTCOMES = [
  "ok",
  "nothing_to_do",
  "partial",
  "needs_attention",
  "rejected",
  "failed",
] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export const RUN_REPORTING_LEVELS = ["silent", "info", "verbose"] as const;
export type RunReportingLevel = (typeof RUN_REPORTING_LEVELS)[number];

export interface RunContractFields {
  /** Value present in the result but outside the enum — for the caller's log. */
  invalid?: { outcome?: unknown; reporting?: unknown };
  outcome: RunOutcome | null;
  reporting: RunReportingLevel | null;
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** Read `outcome` / `reporting` off a run result, dropping invalid values. */
export function extractRunContractFields(result: unknown): RunContractFields {
  if (!result || typeof result !== "object") {
    return { outcome: null, reporting: null };
  }
  const record = result as Record<string, unknown>;
  const outcome = pick(record.outcome, RUN_OUTCOMES);
  const reporting = pick(record.reporting, RUN_REPORTING_LEVELS);
  const invalid: RunContractFields["invalid"] = {};
  if (record.outcome !== undefined && outcome === null) {
    invalid.outcome = record.outcome;
  }
  if (record.reporting !== undefined && reporting === null) {
    invalid.reporting = record.reporting;
  }
  return {
    outcome,
    reporting,
    ...(Object.keys(invalid).length > 0 ? { invalid } : {}),
  };
}
