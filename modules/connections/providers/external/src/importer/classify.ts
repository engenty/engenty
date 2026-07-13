import type { ActionClassification } from "../types.js";

/**
 * Map an HTTP method (plus path hints) onto the connections-framework action
 * groups. Groups drive default policy (read→allow, write/destructive→ask) and
 * the approval contract, so lean conservative: anything ambiguous is `write`,
 * clearly irreversible verbs are `destructive`.
 */
const DESTRUCTIVE_PATH_HINT =
  /\b(delete|remove|destroy|purge|revoke|cancel|terminate)\b/iu;

export function classifyHttpOperation(
  method: string,
  pathTemplate: string
): ActionClassification {
  const m = method.toLowerCase();
  if (m === "get" || m === "head" || m === "options") {
    return "read";
  }
  if (m === "delete") {
    return "destructive";
  }
  if (DESTRUCTIVE_PATH_HINT.test(pathTemplate)) {
    return "destructive";
  }
  return "write";
}

/**
 * MCP tool annotations → classification. `readOnlyHint` is trusted for reads;
 * `destructiveHint` for destructive; everything else defaults to `write`
 * (server-provided hints are advisory, so no hint never yields `read`).
 */
export function classifyMcpTool(annotations: {
  destructiveHint?: boolean;
  readOnlyHint?: boolean;
}): ActionClassification {
  if (annotations.readOnlyHint === true) {
    return "read";
  }
  if (annotations.destructiveHint === true) {
    return "destructive";
  }
  return "write";
}
