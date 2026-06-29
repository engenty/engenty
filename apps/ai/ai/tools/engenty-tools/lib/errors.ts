import { EngentyCoreHttpError } from "../../../../src/ai/core-http-client.js";

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
