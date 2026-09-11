import { EngentyCoreHttpError } from "../../../../src/ai/core-http-client.js";

export const NO_TOOL_RESULT_GUIDANCE =
  "Do not guess; report retrieval failure or retry once.";

export function noToolResultError(operationId?: string) {
  const subject = operationId
    ? `Operation ${operationId} returned no readable result. `
    : "The tool call ended without a readable result. ";
  return {
    ok: false as const,
    error: "no_tool_result" as const,
    message: `${subject}${NO_TOOL_RESULT_GUIDANCE} Never invent names, IDs, rows, amounts, statuses, or counts.`,
    ...(operationId ? { operation_id: operationId } : {}),
  };
}

export function coreErrorToToolResult(err: unknown) {
  if (err instanceof EngentyCoreHttpError) {
    return {
      ok: false,
      code: err.code,
      details: err.details,
      message: err.message,
      status: err.status,
    };
  }
  return {
    ok: false,
    code: "tool_execution_failed",
    message: err instanceof Error ? err.message : "Engenty tool failed.",
  };
}
