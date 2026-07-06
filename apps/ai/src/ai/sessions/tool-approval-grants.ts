// Phase 3.2c — tool-approval grants, persisted on session metadata.
//
// When the user approves a gated operation, we record its operation id here so the
// re-run's pre-gate (and any later call to the SAME operation) passes without
// re-prompting. This is OUR durable grant store: Mastra's session grants are
// in-memory and cleared on thread switch/abort, so they cannot survive the
// approve → re-run hop (a fresh run).
//
// Two scopes, both persisted (so they survive across the resume runs of ONE request
// — a single create can resume several times when the agent interleaves a domain
// decision between the approval and the actual execute):
//   - PERSISTENT ("Approve always") — lives for the whole thread.
//   - ONCE ("Approve once") — lives only until the next FRESH user turn, when the
//     route clears it. Without persisting it, "once" was lost on the very next
//     resume and the same op re-prompted repeatedly within one request.
export const TOOL_APPROVAL_GRANTS_METADATA_KEY = "engenty_tool_approval_grants";
export const TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY =
  "engenty_tool_approval_grants_once";

function readKey(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string[] {
  const raw = metadata?.[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * All granted operation ids in effect for the next run — the union of persistent
 * ("always") and once grants. This is what the route hands the executor, so the
 * execute-boundary gate sees both.
 */
export function readToolApprovalGrants(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  const persistent = readKey(metadata, TOOL_APPROVAL_GRANTS_METADATA_KEY);
  const once = readKey(metadata, TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY);
  return Array.from(new Set([...persistent, ...once]));
}

/** Add `operationId` to the PERSISTENT ("always") grant list (idempotent). */
export function withToolApprovalGrant(
  metadata: Record<string, unknown> | null | undefined,
  operationId: string
): Record<string, unknown> {
  const base = metadata ?? {};
  const existing = readKey(base, TOOL_APPROVAL_GRANTS_METADATA_KEY);
  if (existing.includes(operationId)) {
    return { ...base };
  }
  return {
    ...base,
    [TOOL_APPROVAL_GRANTS_METADATA_KEY]: [...existing, operationId],
  };
}

/**
 * Add `operationId` to the ONCE grant list (idempotent). Persisted so it survives
 * the resume runs of the current request; cleared by `clearOnceToolApprovalGrants`
 * at the next fresh user turn.
 */
export function withToolApprovalGrantOnce(
  metadata: Record<string, unknown> | null | undefined,
  operationId: string
): Record<string, unknown> {
  const base = metadata ?? {};
  const existing = readKey(base, TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY);
  if (existing.includes(operationId)) {
    return { ...base };
  }
  return {
    ...base,
    [TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY]: [...existing, operationId],
  };
}

/** Drop all ONCE grants (called when a fresh user turn starts). Persistent grants stay. */
export function clearOnceToolApprovalGrants(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const base = metadata ?? {};
  if (!(TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY in base)) {
    return { ...base };
  }
  const next = { ...base };
  delete next[TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY];
  return next;
}
