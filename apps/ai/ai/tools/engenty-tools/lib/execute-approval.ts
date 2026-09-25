import { z } from "zod";
import type { EngentyCoreHttpError } from "../../../../src/ai/core-http-client.js";
import type { getCurrentEngentyToolsClient } from "./client.js";
import { isRecord } from "./format.js";
import {
  getEngentyToolsRunContext,
  type ToolRequestContextCarrier,
} from "./run-context.js";
import {
  buildToolApprovalArtifact,
  type ToolRiskLevel,
} from "./tool-approval.js";

/**
 * Suspend payload when a gated operation needs the user's approval (native
 * Mastra HITL): the run parks, the chat shows the Approve/Deny card, and the
 * resume re-executes this tool with {@link ToolApprovalResumeData} set.
 */
export const toolApprovalSuspendSchema = z.object({
  kind: z.literal("tool_approval"),
  operation_id: z.string(),
  requires_approval: z.boolean(),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  // Narrow, allow-listed grant context: the secret a secrets_reveal approval
  // covers, so approving can persist a durable goal-scoped grant. Never the
  // raw tool input (it may hold sensitive values and this lands in metadata).
  secret_id: z.string().uuid().optional(),
  // The core.approval_requests row behind a 202 backstop card. Approving
  // decides THAT request, which is what mints the grant core's own policy
  // reads on the retry.
  approval_request_id: z.string().uuid().optional(),
  title: z.string().optional(),
  // Bulk pre-approval (engenty_tools_preapprove): every operation this ONE
  // card covers — approving persists a grant for each. `operation_id` stays
  // the primary op so existing single-op parsing keeps working.
  operation_ids: z.array(z.string()).optional(),
  // Card body: the agent-authored plan summary (bulk cards), or the exact
  // command / path a workspace call would act on.
  body: z.string().optional(),
});

export type ToolApprovalSuspendPayload = z.infer<
  typeof toolApprovalSuspendSchema
>;

/** What the resume delivers back into the suspended tool: the user's decision. */
export const toolApprovalResumeSchema = z.object({
  approved: z.boolean(),
  choice_id: z.string().optional(),
});

export type ToolApprovalResumeData = z.infer<typeof toolApprovalResumeSchema>;

export function isToolApprovalSuspendPayload(
  value: unknown
): value is ToolApprovalSuspendPayload {
  return toolApprovalSuspendSchema.safeParse(value).success;
}

/** The model-facing result when a gated operation does not run. */
export function approvalUnavailableResult(operationId: string) {
  return {
    ok: false as const,
    error: "approval_required",
    message: `Operation ${operationId} requires the user's approval, which is not available in this run. Report that this step needs approval instead of retrying.`,
  };
}

/**
 * Sandbox (Code Mode) result for a gated operation with no covering grant. A
 * program cannot suspend for a human mid-flight, so the call fails INTO the
 * program with the recovery path spelled out: get the grant first (one bulk
 * pre-approval card in chat), then re-run the program.
 */
export function sandboxApprovalRequiredResult(
  operationId: string,
  riskLevel: ToolRiskLevel
) {
  return {
    ok: false as const,
    error: "approval_required",
    message:
      `Operation ${operationId} (${riskLevel} risk) needs the user's approval before it can run from a sandbox program. ` +
      "From chat, call engenty_tools_preapprove with EVERY write operation the program will use (one approval card covers them all), " +
      "or run the operation once via engenty_tool_execute so the user can approve it; then re-run the program.",
  };
}

/**
 * The sandbox gate mirrors core's unattended-principal rule: a program runs
 * without a human watching each call, so anything explicitly approval-gated or
 * high/critical risk needs a pre-existing grant. Deliberately STRICTER than the
 * interactive pre-gate (which only gates on `requiresApproval` and lets core
 * decide risk) — bulk mutation from generated code earns the extra bar. Core
 * remains authoritative behind it either way.
 */
export function sandboxRequiresGrant(input: {
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
}): boolean {
  return (
    input.requiresApproval ||
    input.riskLevel === "high" ||
    input.riskLevel === "critical"
  );
}

/**
 * Spend a consent the user already gave on the approval request core filed, then
 * retry the invoke once.
 *
 * Two gates can fire for one operation: the AI pre-gate (contract
 * `requiresApproval`) and core's own policy (escalation, connections). Each
 * raised its own card, so a single `projects_create` asked the user twice — the
 * pre-gate card, then core's 202 card — and answering the first bought nothing.
 * Here the user has just answered the pre-gate card for THIS operation, so we
 * decide core's request with that same answer instead of asking again.
 *
 * Deliberately narrow: same principal (the run's user token), same operation id,
 * same turn, and core still records the decider and mints the grant, so nothing
 * is bypassed — only the second question is. Returns null when there is no
 * request id to decide or the retry still gates, letting the caller report a
 * genuine policy mismatch.
 */
export async function settleCoreApprovalAndRetry(params: {
  choiceId?: string;
  // The NARROWED client: `client.ok` is already checked before the try block
  // whose catch calls this, but that narrowing does not survive into a helper.
  client: Extract<
    ReturnType<typeof getCurrentEngentyToolsClient>,
    { ok: true }
  >;
  err: EngentyCoreHttpError;
  input: Record<string, unknown>;
  operationId: string;
  /** The Space the original call named (`callSpaceIdFor`). */
  spaceId?: string;
}): Promise<{ data: unknown; ok: true } | null> {
  const details = isRecord(params.err.details) ? params.err.details : {};
  const approvalRequestId =
    typeof details.approvalRequestId === "string"
      ? details.approvalRequestId
      : undefined;
  if (!approvalRequestId) {
    return null;
  }
  const ctx = getEngentyToolsRunContext();
  // "Always (this chat)" elevates for the whole goal; "once" is spent on use.
  // Same mapping the resume route uses, so both paths agree.
  const always = params.choiceId === "approve_always";
  try {
    await params.client.client.decideApproval(approvalRequestId, {
      decision: always ? "allow_policy" : "allow_once",
      ...(always && ctx.goalId ? { subject_id: ctx.goalId } : {}),
    });
    const data = await params.client.client.invokeTool(
      params.operationId,
      params.input,
      params.spaceId ? { spaceId: params.spaceId } : undefined
    );
    return { data, ok: true };
  } catch (retryErr) {
    console.error(
      `core approval settle+retry failed for ${params.operationId}`,
      retryErr
    );
    return null;
  }
}

export function parseToolRiskLevel(raw: unknown): ToolRiskLevel | undefined {
  if (
    raw === "low" ||
    raw === "medium" ||
    raw === "high" ||
    raw === "critical"
  ) {
    return raw;
  }
  return;
}

export function approvalDeniedResult(operationId: string) {
  return {
    ok: false as const,
    error: "approval_denied",
    message: `The user denied approval for ${operationId}. Do not retry it; continue without this operation.`,
  };
}

/**
 * Defer-policy result for core's 202: a human approval request is now pending
 * (durable, e.g. a connections approval routed to the connection owner). The
 * task should report the block; a re-dispatch after approval will pass.
 */
export function approvalPendingResult(operationId: string, reason?: string) {
  return {
    ok: false as const,
    error: "approval_pending",
    message: `Operation ${operationId} needs human approval before it can run.${
      reason ? ` ${reason}` : ""
    } The approval request has been recorded; do not retry in this run. Report that this step is blocked on approval and continue with what you can finish without it.`,
  };
}

/**
 * Handle an operation that requires approval, per the run's approval policy:
 * suspend the Mastra run (interactive chat — the resume re-executes this tool
 * with the decision), return the decision artifact (voice AND the interactive
 * start lane, which gates under "artifact" and re-runs with the grant), or
 * return a clear denial (leaf runs: delegated children and headless jobs have
 * no interactive channel).
 *
 * `operationIds`/`body` make it a BULK card (engenty_tools_preapprove): one
 * decision covering several operations, with the agent's plan as the body.
 * Exported so the preapprove tool shares this exact cascade — a second copy
 * would drift on the next policy change.
 */
export async function gateRequiresApproval(input: {
  /**
   * Set only on the core-202 backstop path: the durable approval request core
   * filed. Rides the card so the approve hook can decide it in core — a chat
   * grant that never reaches core leaves the retry gated by the same policy.
   */
  approvalRequestId?: string;
  body?: string;
  /**
   * The gated call's own arguments (single-operation gates only). Recorded on
   * the "request" path so the approval can replay the exact call the human
   * approved, once, instead of the resumed model re-deriving it.
   */
  callInput?: Record<string, unknown>;
  context: ToolRequestContextCarrier<ToolApprovalSuspendPayload> | undefined;
  operationId: string;
  operationIds?: string[];
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
  secretId?: string;
  title?: string;
}) {
  const ctx = getEngentyToolsRunContext();
  const policy = ctx.approvalPolicy ?? "deny";
  if (policy === "request") {
    // Durable run with a needs-input channel: record the request and end
    // gracefully. The workflow surfaces the inbox notification + task comment;
    // a human approves and the task re-dispatches. Bulk: one request per
    // operation, so each grant lands individually — and no args are recorded,
    // because a bulk card approves a plan, not one replayable call.
    const isBulk = Boolean(input.operationIds?.length);
    for (const operationId of input.operationIds ?? [input.operationId]) {
      ctx.onApprovalRequired?.({
        operationId,
        riskLevel: input.riskLevel,
        ...(input.title ? { title: input.title } : {}),
        ...(input.callInput && !isBulk ? { input: input.callInput } : {}),
      });
    }
    return approvalPendingResult(input.operationId);
  }
  const suspend = input.context?.agent?.suspend;
  if (policy === "suspend" && suspend) {
    await suspend({
      kind: "tool_approval",
      operation_id: input.operationId,
      requires_approval: input.requiresApproval,
      risk_level: input.riskLevel,
      ...(input.secretId ? { secret_id: input.secretId } : {}),
      ...(input.approvalRequestId
        ? { approval_request_id: input.approvalRequestId }
        : {}),
      ...(input.operationIds?.length
        ? { operation_ids: input.operationIds }
        : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.title ? { title: input.title } : {}),
    } satisfies ToolApprovalSuspendPayload);
    // Unreachable once resumed (execute re-runs with resumeData set), but Mastra
    // requires a value/void return on the suspend path.
    return undefined as never;
  }
  if (policy === "artifact") {
    const grantContext = {
      ...(input.secretId ? { secret_id: input.secretId } : {}),
      ...(input.approvalRequestId
        ? { approval_request_id: input.approvalRequestId }
        : {}),
    };
    return buildToolApprovalArtifact({
      operationId: input.operationId,
      requiresApproval: input.requiresApproval,
      riskLevel: input.riskLevel,
      ...(Object.keys(grantContext).length > 0 ? { grantContext } : {}),
      ...(input.operationIds?.length
        ? { operationIds: input.operationIds }
        : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.title ? { title: input.title } : {}),
    });
  }
  return approvalUnavailableResult(input.operationId);
}
