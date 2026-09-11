// Exactly-once for identical write calls within one run.
//
// On 2026-08-22 a resumed knowledge-base task executed `kb_source_create`
// twice with byte-identical arguments 35 seconds apart (module_kb.kb_sources
// 01a029dd-3985… and 01a029dd-c4ce…): the park had gone through the BULK
// pre-approval path, which records no per-call args, so nothing was replayed
// on resume and the re-briefed model both created the source and — after two
// unrelated gate refusals — created it again. Once the human grant is in
// place, nothing upstream stops a repeat: the approval gate passes, core
// happily inserts a second row.
//
// This module closes that hole at the execute layer: every successful
// non-read-only invoke registers a canonical invocation key (operation id +
// canonicalized input) in the run's dedupe map, and an identical repeat is
// refused with the FIRST call's result attached — the model gets the record
// id it lost instead of a second row. A deliberate repeat (re-running an
// ingestion, sending the same reminder again) stays possible via the
// `_repeat: true` input flag, which is stripped before the call reaches core.
import { isRecord } from "./format.js";

/**
 * Reserved input flag: `{"_repeat": true}` bypasses the duplicate check for
 * one call. Model-facing only — always stripped before the input reaches the
 * approval gate or core.
 */
export const REPEAT_INPUT_FLAG = "_repeat";

/** JSON with recursively sorted object keys, so key order cannot defeat dedupe. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortValue(value[key]);
    }
    return sorted;
  }
  return value;
}

export function invocationKey(
  operationId: string,
  input: Record<string, unknown>
): string {
  return `${operationId}:${canonicalJson(input)}`;
}

/**
 * Split the reserved repeat flag off a call's input. The flag must never be
 * forwarded (core would reject or, worse, store it) and must not participate
 * in the invocation key (else `_repeat: true` would simply mint a "different"
 * call instead of authorizing a repeat of the same one).
 */
export function splitRepeatFlag(input: Record<string, unknown>): {
  input: Record<string, unknown>;
  repeat: boolean;
} {
  if (!(REPEAT_INPUT_FLAG in input)) {
    return { input, repeat: false };
  }
  const { [REPEAT_INPUT_FLAG]: flag, ...rest } = input;
  return { input: rest, repeat: flag === true };
}

/**
 * The model-facing refusal for an identical repeated write. Carries the first
 * call's result so the model can continue from the record it already created
 * (losing that id is exactly what caused the duplicate-create incidents).
 */
export function duplicateCallResult(operationId: string, previous: unknown) {
  return {
    ok: false as const,
    error: "duplicate_call",
    message:
      `This exact ${operationId} call (identical arguments) already executed successfully in this run; ` +
      "its result is in previous_result. Do not run it again — use the record from previous_result and continue. " +
      `Only if you deliberately need to execute the same call a second time (e.g. re-trigger a run), add "${REPEAT_INPUT_FLAG}": true to the input.`,
    previous_result: previous,
  };
}
