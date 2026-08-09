// Byte budget for Code Mode results.
//
// Code Mode exists to collapse N tool round-trips into one program — but the
// program's RETURN VALUE lands in the thread verbatim and is replayed on every
// subsequent turn. One real run returned the full project tree (every phase and
// task with UUIDs) as an 88 KB `result`, and the next turn's prompt was 116,596
// tokens. The batching win is real; paying for it forever in history is not.
//
// Truncation is structural rather than a blind string cut: arrays keep a prefix
// and say how many rows were dropped, objects share the budget with their small
// fields served first, and every elision is labelled so the model can tell the
// difference between "there were 12 rows" and "there were 400 and you saw 12".
// The agent can always re-run a narrower program.

/** Serialized-byte ceiling for the program's return value. */
export const CODE_MODE_RESULT_BYTE_BUDGET = 12_000;

/** Serialized-byte ceiling for captured console output. */
export const CODE_MODE_LOGS_BYTE_BUDGET = 2000;

/** Room kept aside so a truncation notice always fits alongside the payload. */
const NOTICE_RESERVE = 140;

/** Floor for any single nested value; below this a share buys nothing useful. */
const MIN_SHARE = 48;

/**
 * Recursion bound. A cyclic result makes `measure` unrepresentable (Infinity),
 * so every level looks over budget and the walk never terminates — programs can
 * absolutely return cycles, and blowing the stack would fail the whole run.
 */
const MAX_DEPTH = 12;

function measure(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    // Cycles and BigInt land here. Unrepresentable is effectively unbounded.
    return Number.POSITIVE_INFINITY;
  }
}

interface Shrunk {
  truncated: boolean;
  value: unknown;
}

function shrinkString(value: string, budget: number): Shrunk {
  const keep = Math.max(0, budget - NOTICE_RESERVE);
  return {
    truncated: true,
    value: `${value.slice(0, keep)}… [truncated — ${value.length} characters total]`,
  };
}

function shrinkArray(
  value: readonly unknown[],
  budget: number,
  depth: number
): Shrunk {
  const items: unknown[] = [];
  let used = 0;
  for (const element of value) {
    const size = measure(element) + 1;
    if (used + size > budget - NOTICE_RESERVE) {
      break;
    }
    items.push(element);
    used += size;
  }
  // A single element bigger than the whole budget would otherwise yield an
  // empty preview, which tells the model nothing about the shape it got back.
  if (items.length === 0 && value.length > 0) {
    items.push(shrinkValue(value[0], budget - NOTICE_RESERVE, depth + 1).value);
  }
  const omitted = value.length - items.length;
  return {
    truncated: true,
    value: {
      items,
      omitted,
      returned: items.length,
      total: value.length,
      truncated: `${omitted} of ${value.length} items omitted to keep this result small. Re-run a narrower program (filter or aggregate in code) if you need the rest.`,
    },
  };
}

function shrinkRecord(
  value: Record<string, unknown>,
  budget: number,
  depth: number
): Shrunk {
  // Smallest fields first: cheap keys survive intact and hand their unspent
  // share to the one field that is actually blowing the budget.
  const entries = Object.entries(value).sort(
    (left, right) => measure(left[1]) - measure(right[1])
  );
  const out: Record<string, unknown> = {};
  let remaining = budget;
  let left = entries.length;
  let truncated = false;

  for (const [key, entryValue] of entries) {
    const share = Math.max(
      MIN_SHARE,
      Math.floor(remaining / Math.max(1, left))
    );
    const keyCost = key.length + 4;
    const result = shrinkValue(
      entryValue,
      Math.max(MIN_SHARE, share - keyCost),
      depth + 1
    );
    out[key] = result.value;
    truncated = truncated || result.truncated;
    remaining = Math.max(0, remaining - (measure(result.value) + keyCost));
    left -= 1;
  }

  return { truncated, value: out };
}

/** Fit any JSON value into `budget` serialized bytes, labelling what it drops. */
export function shrinkValue(value: unknown, budget: number, depth = 0): Shrunk {
  if (measure(value) <= budget) {
    return { truncated: false, value };
  }
  if (typeof value === "string") {
    return shrinkString(value, budget);
  }
  if (depth >= MAX_DEPTH) {
    return {
      truncated: true,
      value: `[omitted — nested more than ${MAX_DEPTH} levels deep or self-referencing]`,
    };
  }
  if (Array.isArray(value)) {
    return shrinkArray(value, budget, depth);
  }
  if (value && typeof value === "object") {
    return shrinkRecord(value as Record<string, unknown>, budget, depth);
  }
  // Numbers, booleans, null: never worth truncating and never large.
  return { truncated: false, value };
}

export interface CodeModeCapBudgets {
  logs?: number;
  result?: number;
}

export interface CappedCodeModeOutcome {
  error?: { message: string; name?: string };
  logs: string[];
  /** Set only when something was elided, so callers can surface it. */
  notice?: string;
  result?: unknown;
  success: boolean;
}

/**
 * Cap a Code Mode outcome's `result` and `logs` to a serialized-byte budget.
 * Shape is preserved for payloads that already fit — the common case pays only
 * one `JSON.stringify`.
 */
export function capCodeModeOutcome(
  outcome: {
    error?: { message: string; name?: string };
    logs?: string[];
    result?: unknown;
    success: boolean;
  },
  budgets?: CodeModeCapBudgets
): CappedCodeModeOutcome {
  const resultBudget = budgets?.result ?? CODE_MODE_RESULT_BYTE_BUDGET;
  const logsBudget = budgets?.logs ?? CODE_MODE_LOGS_BYTE_BUDGET;

  const shrunkResult =
    outcome.result === undefined
      ? { truncated: false, value: undefined }
      : shrinkValue(outcome.result, resultBudget);
  const shrunkLogs = shrinkValue(outcome.logs ?? [], logsBudget);

  // `logs` is declared as string[]; a shrunk array becomes a wrapper object, so
  // fold it back into one explanatory line rather than lying about the type.
  const logs: string[] = Array.isArray(shrunkLogs.value)
    ? (shrunkLogs.value as string[])
    : [
        ...((shrunkLogs.value as { items?: unknown[] }).items ?? []).map(
          (line) => (typeof line === "string" ? line : String(line))
        ),
        `[console output truncated — ${(outcome.logs ?? []).length} lines total]`,
      ];

  const notices: string[] = [];
  if (shrunkResult.truncated) {
    notices.push(
      "The returned value was truncated to keep the conversation small — aggregate or filter inside the program instead of returning raw rows."
    );
  }
  if (shrunkLogs.truncated) {
    notices.push("Console output was truncated.");
  }

  return {
    ...(outcome.error ? { error: outcome.error } : {}),
    logs,
    ...(notices.length > 0 ? { notice: notices.join(" ") } : {}),
    ...(shrunkResult.value === undefined ? {} : { result: shrunkResult.value }),
    success: outcome.success,
  };
}
