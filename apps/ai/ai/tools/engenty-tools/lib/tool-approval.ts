// Phase 3.2c — tool-approval policy spine (the single `decide`).
//
// Engenty agents call ONE generic tool, `engenty_tool_execute({ id, input })`, so
// the real authorization signal lives in the resolved tool CONTRACT (its
// `auth.requiresApproval` / `auth.riskLevel`), not the Mastra tool name. Core
// remains the authoritative policy engine: `describeTool` returns this metadata
// and `invokeTool` returns HTTP 202 `approval_required` when it truly gates. This
// module is the AI-side PRE-GATE that mirrors core's rule so we surface a HITL
// card BEFORE the wasted round-trip — and we honor core's 202 as the backstop.
// A thread-scoped grant (the user said "Approve") bypasses the gate.
//
// Core's rule, exactly (apps/core/src/security/policy.ts `evaluatePolicy`):
// a NON-USER principal requires approval when `requiresApproval ||
// riskLevel ∈ {high, critical}` — except the platform's own service credential
// acting with no agent in the chain, which is unattended by definition and
// would deadlock. An agent riding that service token still escalates: that is
// the durable-approvals lane. Ahead of all of it, a registered profile policy
// may decide first — the connections gate, and the agent escalation policy
// (always registered), which escalates any operation whose required
// capabilities fall outside the agent's role grants ∪ goal grants.
// The pre-gate here is deliberately NARROWER than core's rule; when they
// disagree, core's 202 wins. Keep this paragraph true — a 2026-08-03 audit
// found it describing a rule the code no longer had.

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

export type ToolApprovalDecision = "allow" | "require_approval";

/** Operation ids (the resolved contract tool id) the user approved for this chat. */
export type ToolApprovalGrants = readonly string[];

export interface ResolveToolApprovalInput {
  grants?: ToolApprovalGrants;
  operationId: string;
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
}

/**
 * The AI-side PRE-GATE is conservative: it gates only on the contract's EXPLICIT
 * `requiresApproval` flag, unless the user already granted this operation for the
 * thread. Nuanced risk-based gating (high/critical) is left to core, which has the
 * full principal context and returns 202 `approval_required` at invoke time — the
 * execute tool catches that as the backstop. `riskLevel` is carried for the card's
 * message, not the decision, so the pre-gate never over-triggers on reads.
 */
export function resolveToolApprovalDecision(
  input: ResolveToolApprovalInput
): ToolApprovalDecision {
  if (!input.requiresApproval) {
    return "allow";
  }
  if (input.grants?.includes(input.operationId)) {
    return "allow";
  }
  return "require_approval";
}

// Tool-approval interrupts ride the existing DECISION-artifact pipeline (3.2a):
// the tool returns this artifact, the run loop detects it via
// `isDecisionArtifactPayload`, aborts, and emits the interactive interrupt — zero
// new interrupt kind, zero new UI. We tag the `artifact_id` so the resume branch
// can recover the operation id and persist the grant.
const TOOL_APPROVAL_ARTIFACT_PREFIX = "tool-approval|";

/**
 * Narrow, allow-listed context an approval carries so the approve hook can
 * persist grants beyond the single primary operation. Deliberately NOT the raw
 * tool input: arbitrary inputs may hold sensitive values and the artifact id
 * lands in chat history. Two allow-listed fields ride along, encoded as an
 * extra `|`-segment of the artifact id (opaque to the client, round-trips
 * through metadata and the resume POST):
 *   - `secret_id` — the secret a secrets_reveal approval covers, so approving
 *     can persist a durable goal-scoped grant (core.agent_goal_grants).
 *   - `operation_ids` — bulk pre-approval (engenty_tools_preapprove): every
 *     operation this ONE card covers, so approving persists a grant for each.
 *   - `approval_request_id` — the durable core.approval_requests row core filed
 *     when it answered 202, so approving can decide THAT request and mint the
 *     grant core's policy actually reads. Without it a chat approval only ever
 *     wrote thread metadata, which core does not consult — core re-gated the
 *     retry and the approved call never ran.
 */
export interface ToolApprovalGrantContext {
  approval_request_id?: string;
  operation_ids?: string[];
  secret_id?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Operation ids as core registers them — conservative charset, bounded length. */
const OPERATION_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** Hard cap on ops one pre-approval card may cover (artifact id stays bounded). */
export const TOOL_APPROVAL_MAX_BULK_OPERATIONS = 20;

export interface ToolApprovalDecisionArtifact {
  artifact_id: string;
  artifact_type: "decision";
  body?: string;
  choices: { id: string; label: string }[];
  interrupt_id: string;
  title: string;
}

// Approve THIS action for the current turn only (no persisted grant → re-prompts
// next time). "Always" additionally persists a thread grant (no re-prompt in chat).
export const TOOL_APPROVAL_CHOICE_APPROVE_ONCE = "approve_once";
export const TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS = "approve_always";
export const TOOL_APPROVAL_CHOICE_DENY = "deny";

export function buildToolApprovalArtifactId(
  operationId: string,
  grantContext?: ToolApprovalGrantContext | null
): string {
  const base = `${TOOL_APPROVAL_ARTIFACT_PREFIX}${encodeURIComponent(operationId)}`;
  // encodeURIComponent escapes "|" (%7C), so the segment split stays unambiguous.
  return grantContext
    ? `${base}|${encodeURIComponent(JSON.stringify(grantContext))}`
    : base;
}

/** Parse the operation id back out of a tool-approval artifact id (resume side). */
export function parseToolApprovalOperationId(
  artifactId: string | undefined | null
): string | null {
  if (
    typeof artifactId !== "string" ||
    !artifactId.startsWith(TOOL_APPROVAL_ARTIFACT_PREFIX)
  ) {
    return null;
  }
  const encoded =
    artifactId.slice(TOOL_APPROVAL_ARTIFACT_PREFIX.length).split("|")[0] ?? "";
  try {
    return decodeURIComponent(encoded) || null;
  } catch {
    return encoded || null;
  }
}

/**
 * Recover the grant context from a tool-approval artifact id. Strictly
 * validated field by field — a malformed segment, non-uuid secret, or invalid
 * operation id yields null / is dropped, never a partially-trusted value.
 */
export function parseToolApprovalGrantContext(
  artifactId: string | undefined | null
): ToolApprovalGrantContext | null {
  if (
    typeof artifactId !== "string" ||
    !artifactId.startsWith(TOOL_APPROVAL_ARTIFACT_PREFIX)
  ) {
    return null;
  }
  const segment = artifactId
    .slice(TOOL_APPROVAL_ARTIFACT_PREFIX.length)
    .split("|")[1];
  if (!segment) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(segment)) as {
      approval_request_id?: unknown;
      operation_ids?: unknown;
      secret_id?: unknown;
    };
    const approvalRequestId =
      typeof parsed.approval_request_id === "string" &&
      UUID_REGEX.test(parsed.approval_request_id)
        ? parsed.approval_request_id
        : undefined;
    const secretId =
      typeof parsed.secret_id === "string" && UUID_REGEX.test(parsed.secret_id)
        ? parsed.secret_id
        : undefined;
    const operationIds = Array.isArray(parsed.operation_ids)
      ? parsed.operation_ids
          .filter(
            (id): id is string =>
              typeof id === "string" && OPERATION_ID_REGEX.test(id)
          )
          .slice(0, TOOL_APPROVAL_MAX_BULK_OPERATIONS)
      : [];
    if (!(secretId || approvalRequestId) && operationIds.length === 0) {
      return null;
    }
    return {
      ...(approvalRequestId ? { approval_request_id: approvalRequestId } : {}),
      ...(secretId ? { secret_id: secretId } : {}),
      ...(operationIds.length > 0 ? { operation_ids: operationIds } : {}),
    };
  } catch {
    return null;
  }
}

export function isToolApprovalArtifactId(
  artifactId: string | undefined | null
): boolean {
  return parseToolApprovalOperationId(artifactId) != null;
}

/**
 * Build the decision-shaped artifact the gate returns INSTEAD of invoking. The
 * user sees Approve once / Approve always / Deny. "Once" runs this turn only;
 * "always" also persists a thread grant; both re-run so the tool executes.
 *
 * A BULK card (`operationIds` set — engenty_tools_preapprove) covers several
 * operations at once: the grant context carries every id so the approve hook
 * persists each, and the choice labels speak in run/chat scope ("once" grants
 * clear on the next fresh user turn, which is exactly "this run").
 */
export function buildToolApprovalArtifact(input: {
  body?: string;
  grantContext?: ToolApprovalGrantContext | null;
  operationId: string;
  operationIds?: string[];
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
  title?: string;
}): ToolApprovalDecisionArtifact {
  const bulkIds =
    input.operationIds && input.operationIds.length > 0
      ? Array.from(new Set([input.operationId, ...input.operationIds]))
      : null;
  const artifactId = buildToolApprovalArtifactId(
    input.operationId,
    bulkIds
      ? { ...input.grantContext, operation_ids: bulkIds }
      : input.grantContext
  );
  const label = input.title?.trim() || input.operationId;
  const reason = input.requiresApproval
    ? "This action requires your approval before it runs."
    : `This action is ${input.riskLevel}-risk and needs your approval before it runs.`;
  const body = bulkIds
    ? `${input.body?.trim() || reason}\n\nOperations: ${bulkIds.join(", ")}`
    : `${input.body?.trim() || reason}\n\nOperation: ${input.operationId}`;
  return {
    artifact_id: artifactId,
    artifact_type: "decision",
    body,
    choices: bulkIds
      ? [
          {
            id: TOOL_APPROVAL_CHOICE_APPROVE_ONCE,
            label: "Approve for this run",
          },
          {
            id: TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS,
            label: "Approve for this chat",
          },
          { id: TOOL_APPROVAL_CHOICE_DENY, label: "Deny" },
        ]
      : [
          { id: TOOL_APPROVAL_CHOICE_APPROVE_ONCE, label: "Approve once" },
          {
            id: TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS,
            label: "Approve always (this chat)",
          },
          { id: TOOL_APPROVAL_CHOICE_DENY, label: "Deny" },
        ],
    interrupt_id: artifactId,
    title: `Approve ${label}?`,
  };
}
