// Client-side reader for tool-approval artifact ids.
//
// MIRRORS the server encoder in
// `apps/ai/ai/tools/engenty-tools/lib/tool-approval.ts`:
//   tool-approval|<encodeURIComponent(operationId)>[|<encodeURIComponent(JSON grantContext)>]
// The grant-context segment is INTERNAL routing data (which ops a bulk approval
// covers, which secret a reveal covers) — it must never reach the card body.
// Rendering `artifactId.slice(prefix.length)` verbatim, as this card used to,
// printed the raw encoded tail at the user:
//   "Operation: time_tracking_entries_create|%7B%22operation_ids%22%3A…%7D"
//
// Parsing is deliberately total: a malformed or unknown-shaped segment degrades
// to "no grant context" rather than throwing — a display helper must never be
// able to break the approval card the user has to answer.

const TOOL_APPROVAL_ARTIFACT_PREFIX = "tool-approval|";

export interface ToolApprovalArtifactId {
  /** The grant context listed the operations: a bulk pre-approval or a
   *  delegated specialist's ask, whose body is a summary — not the call. */
  listed: boolean;
  /** The primary operation id (the one the server keys the grant on). */
  operationId: string;
  /** Every operation the card covers — the primary op first. Length > 1 marks a
   *  BULK pre-approval (engenty_tools_preapprove), which changes the copy. */
  operationIds: string[];
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Not valid percent-encoding: show what we have rather than nothing.
    return segment;
  }
}

/** Operation ids as core registers them — same conservative shape the server validates. */
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function readGrantContextOperationIds(segment: string | undefined): {
  ids: string[];
  listed: boolean;
} {
  if (!segment) {
    return { ids: [], listed: false };
  }
  try {
    const parsed = JSON.parse(decodeSegment(segment)) as {
      operation_ids?: unknown;
    };
    if (!Array.isArray(parsed.operation_ids)) {
      return { ids: [], listed: false };
    }
    // Listed even when no id passes the display pattern: a workspace id
    // carries its command, spaces and all.
    return {
      ids: parsed.operation_ids.filter(
        (id): id is string =>
          typeof id === "string" && OPERATION_ID_PATTERN.test(id)
      ),
      listed: true,
    };
  } catch {
    return { ids: [], listed: false };
  }
}

/**
 * Parse a tool-approval artifact id, or null when `artifactId` is not one
 * (every other decision artifact renders its own server-authored copy).
 */
export function parseToolApprovalArtifactId(
  artifactId: string
): ToolApprovalArtifactId | null {
  if (!artifactId.startsWith(TOOL_APPROVAL_ARTIFACT_PREFIX)) {
    return null;
  }
  const segments = artifactId
    .slice(TOOL_APPROVAL_ARTIFACT_PREFIX.length)
    .split("|");
  const operationId = decodeSegment(segments[0] ?? "");
  if (!operationId) {
    return null;
  }
  const context = readGrantContextOperationIds(segments[1]);
  // The primary op leads; the grant context repeats it, so de-dupe.
  const operationIds = Array.from(new Set([operationId, ...context.ids]));
  return { listed: context.listed, operationId, operationIds };
}
