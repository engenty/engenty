import { noToolResultError } from "./errors.js";
import { isRecord } from "./format.js";

export const EMPTY_EXECUTE_RESULT_MESSAGE =
  "The operation succeeded and returned no records. Report an empty result; do not invent rows.";

const EMPTY_LIST_KEYS = ["data", "items", "records", "results"] as const;

export interface ExecuteEmptyMeta {
  empty: true;
  message: typeof EMPTY_EXECUTE_RESULT_MESSAGE;
  source: "engenty_tool_execute";
}

export type ExecuteEvidenceResult =
  | {
      data: unknown;
      ok: true;
      operation_id: string;
      meta?: ExecuteEmptyMeta;
    }
  | ReturnType<typeof noToolResultError>;

/**
 * Core returned a body the model can report. `undefined` / `null` / a blank
 * string are not readable — those are retrieval failures, not empty lists.
 */
export function isReadableExecuteData(data: unknown): boolean {
  if (data === undefined || data === null) {
    return false;
  }
  if (typeof data === "string") {
    return data.trim().length > 0;
  }
  return true;
}

function listFromPayload(data: Record<string, unknown>): unknown[] | undefined {
  for (const key of EMPTY_LIST_KEYS) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return;
}

/**
 * A real empty collection — `[]`, `{ data: [], total: 0 }`, `{ items: [] }`.
 * Distinct from a missing/unreadable body: empty is success the model must
 * report as empty, not invent from.
 */
export function isEmptyExecutePayload(data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.length === 0;
  }
  if (!isRecord(data)) {
    return false;
  }
  const list = listFromPayload(data);
  if (!list) {
    return false;
  }
  if (list.length > 0) {
    return false;
  }
  if (typeof data.total === "number") {
    return data.total === 0;
  }
  return true;
}

/**
 * Wrap a completed invoke so catalog contracts, empty lists, and missing
 * bodies cannot be confused with one another.
 */
export function normalizeExecuteEvidence(
  operationId: string,
  data: unknown
): ExecuteEvidenceResult {
  if (!isReadableExecuteData(data)) {
    return noToolResultError(operationId);
  }
  if (isEmptyExecutePayload(data)) {
    return {
      ok: true,
      operation_id: operationId,
      data,
      meta: {
        source: "engenty_tool_execute",
        empty: true,
        message: EMPTY_EXECUTE_RESULT_MESSAGE,
      },
    };
  }
  return {
    ok: true,
    operation_id: operationId,
    data,
  };
}
