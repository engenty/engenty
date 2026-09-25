// Phase 3.2c — tool-approval grants, persisted on session metadata.
//
// When the user approves a gated operation, we record its operation id here so the
// re-run's pre-gate (and any later call to the SAME operation) passes without
// re-prompting. This is OUR durable grant store: Mastra's session grants are
// in-memory and cleared on thread switch/abort, so they cannot survive the
// approve → re-run hop (a fresh run).
//
// ONCE grants ("Approve once", and the current request of "Approve for this
// agent") live only until the next FRESH user turn, when the route clears them.
// They are persisted so they survive the resume runs of ONE request — a single
// create can resume several times when the agent interleaves a domain decision
// between the approval and the actual execute. Standing approvals live on the
// agent (`agent-approval-grants.ts`), not on the thread.
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

/** The once grants in effect for the next run of this thread. */
export function readToolApprovalGrants(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  return readKey(metadata, TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY);
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

/** Drop all ONCE grants (called when a fresh user turn starts). */
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
