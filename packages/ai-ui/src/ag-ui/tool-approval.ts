// Client-side readers for the tool-approval lane.
//
// An approval is NOT a decision, but it rides the decision-artifact pipeline:
// the gate in apps/ai (`ai/tools/engenty-tools/lib/tool-approval.ts`) returns a
// decision-shaped artifact whose `artifact_id` is tagged `tool-approval|…`, and
// the transcript therefore names the part `requestDecision` like any chooser.
// Every reader that only looks at the tool NAME calls the row a decision — the
// user is approving an operation, not answering a question.
//
// Answering makes it worse: the resume replaces the artifact in `output` with a
// RESOLUTION record (`{approved, operation_id}` — apps/ai
// `resolveToolCallResultInHistory`), so the answered row keeps neither the
// question nor the choices, and degrades to a contextless "Decision needed"
// with a raw `approved: true` dump behind the chevron.
//
// Both readers are total: an unknown shape yields null/false rather than
// throwing — these feed transcript rows, which must never be able to break.

/** MIRRORS the server encoder (`buildToolApprovalArtifactId`). */
export const TOOL_APPROVAL_ARTIFACT_PREFIX = "tool-approval|";

/** MIRRORS the server's choice ids (`buildToolApprovalArtifact`). */
export const TOOL_APPROVAL_CHOICE_APPROVE_ONCE = "approve_once";
export const TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS = "approve_always";
export const TOOL_APPROVAL_CHOICE_DENY = "deny";

/** Operation ids as core registers them — same conservative shape the server validates. */
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Tool output as a record. Some lanes hand the transcript its output already
 * parsed, others hand over the raw JSON the tool returned — a reader that only
 * accepts objects works in the live stream and then silently stops working on
 * the reloaded thread.
 */
function readOutputRecord(output: unknown): Record<string, unknown> | null {
  if (isRecord(output)) {
    return output;
  }
  if (typeof output !== "string" || !output.trim().startsWith("{")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(output);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isToolApprovalArtifactId(value: unknown): boolean {
  return (
    typeof value === "string" && value.startsWith(TOOL_APPROVAL_ARTIFACT_PREFIX)
  );
}

/** The PENDING side: a decision artifact the approval gate authored. */
export function isToolApprovalArtifactOutput(output: unknown): boolean {
  const record = readOutputRecord(output);
  return record != null && isToolApprovalArtifactId(record.artifact_id);
}

/** The gate's own question ("Approve <operation>?"), while the card is open. */
export function readToolApprovalArtifactTitle(output: unknown): string | null {
  const record = readOutputRecord(output);
  if (!(record && isToolApprovalArtifactId(record.artifact_id))) {
    return null;
  }
  return typeof record.title === "string" && record.title.trim()
    ? record.title.trim()
    : null;
}

export interface ToolApprovalResolution {
  approved: boolean;
  /** Every operation the answer covered — one, or the whole bulk pre-approval. */
  operationIds: string[];
}

/**
 * The ANSWERED side: what the user approved or denied, read off the resolution
 * the resume wrote over the artifact. Requires both halves (the verdict AND at
 * least one operation id) so no unrelated tool output carrying an `approved`
 * flag can be mistaken for an approval row.
 */
export function parseToolApprovalResolution(
  output: unknown
): ToolApprovalResolution | null {
  const record = readOutputRecord(output);
  if (!record || typeof record.approved !== "boolean") {
    return null;
  }
  const primary =
    typeof record.operation_id === "string" &&
    OPERATION_ID_PATTERN.test(record.operation_id)
      ? record.operation_id
      : null;
  const bulk = Array.isArray(record.operation_ids)
    ? record.operation_ids.filter(
        (id): id is string =>
          typeof id === "string" && OPERATION_ID_PATTERN.test(id)
      )
    : [];
  // The primary op leads; the bulk list repeats it, so de-dupe.
  const operationIds = Array.from(
    new Set([...(primary ? [primary] : []), ...bulk])
  );
  if (operationIds.length === 0) {
    return null;
  }
  return { approved: record.approved, operationIds };
}

/**
 * Whether a chosen approval option approved or denied — `null` when the answer
 * is not one of the gate's own options (a custom typed answer, an unknown id).
 *
 * Deliberately not a boolean: this is a security surface, and "not one of the
 * three" must never fall through to "approved".
 */
export function resolveToolApprovalChoiceVerdict(
  choiceId: string
): boolean | null {
  if (choiceId === TOOL_APPROVAL_CHOICE_DENY) {
    return false;
  }
  if (
    choiceId === TOOL_APPROVAL_CHOICE_APPROVE_ONCE ||
    choiceId === TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS
  ) {
    return true;
  }
  return null;
}
