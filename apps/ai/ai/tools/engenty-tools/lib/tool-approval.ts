// Phase 3.2c — tool-approval policy spine (the single `decide`).
//
// Engenty agents call ONE generic tool, `engenty_tool_execute({ id, input })`, so
// the real authorization signal lives in the resolved tool CONTRACT (its
// `auth.requiresApproval` / `auth.riskLevel`), not the Mastra tool name. Core
// remains the authoritative policy engine: `describeTool` returns this metadata
// and `invokeTool` returns HTTP 202 `approval_required` when it truly gates. This
// module is the AI-side PRE-GATE that mirrors core's rule (see
// apps/core/src/security/policy.ts `evaluatePolicy`: an agent principal requires
// approval when `requiresApproval || riskLevel ∈ {high, critical}`) so we surface
// a HITL card BEFORE the wasted round-trip — and we honor core's 202 as the
// backstop. A thread-scoped grant (the user said "Approve") bypasses the gate.

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
 * persist a DURABLE goal-scoped grant (core.agent_goal_grants), not just the
 * chat grant. Deliberately NOT the raw tool input: arbitrary inputs may hold
 * sensitive values and the artifact id lands in chat history. Only the
 * secret's uuid rides along, encoded as an extra `|`-segment of the artifact
 * id (opaque to the client, round-trips through metadata and the resume POST).
 */
export interface ToolApprovalGrantContext {
  secret_id: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Recover the grant context (secret_id) from a tool-approval artifact id.
 * Strictly validated — a malformed or non-uuid segment yields null, never a
 * partially-trusted value.
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
      secret_id?: unknown;
    };
    return typeof parsed.secret_id === "string" &&
      UUID_REGEX.test(parsed.secret_id)
      ? { secret_id: parsed.secret_id }
      : null;
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
 */
export function buildToolApprovalArtifact(input: {
  grantContext?: ToolApprovalGrantContext | null;
  operationId: string;
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
  title?: string;
}): ToolApprovalDecisionArtifact {
  const artifactId = buildToolApprovalArtifactId(
    input.operationId,
    input.grantContext
  );
  const label = input.title?.trim() || input.operationId;
  const reason = input.requiresApproval
    ? "This action requires your approval before it runs."
    : `This action is ${input.riskLevel}-risk and needs your approval before it runs.`;
  return {
    artifact_id: artifactId,
    artifact_type: "decision",
    body: `${reason}\n\nOperation: ${input.operationId}`,
    choices: [
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
