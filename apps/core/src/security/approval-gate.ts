import type { createApprovalService } from "@engenty/approvals-sdk";
import type { PluginRegistry } from "../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "./audit-adapter.js";
import { recordModuleAuditEvent } from "./audit-service.js";
import type { PrincipalContext } from "./auth.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

/**
 * The single place a `require_approval` policy decision becomes "ask a human"
 * (D2). Grants are no longer consulted here: they are authorization state, so
 * `evaluatePolicy` spends them itself (phase 3) and only ever returns
 * `require_approval` when a human genuinely has to answer — by the time a
 * transport calls this, the only thing left to do IS the ask.
 *
 * Three transports reach this point — module operations over the invoke route,
 * the module-ops batch route, and plugin HTTP — and each used to spell the
 * sequence out inline. They drifted: the plugin-HTTP copy never recorded
 * `policy.require_approval` and never told the caller when the request expires,
 * so the same blocked call looked different depending on how it arrived. A gate
 * that decides who may act is not a thing to keep three copies of.
 */

export interface FiledApprovalRequest {
  approvalRequestId: string;
  expiresAt: string;
  reason: string;
}

export async function fileApprovalRequest(params: {
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  auth: PrincipalContext;
  /** Audit `source_component`, e.g. "plugin-http". */
  component?: string;
  /**
   * Module detail the policy attached to its `require_approval` decision
   * (`PolicyDecision.approvalContext`) — stored on the request so the owning
   * module's approvals UI can describe the blocked call.
   */
  context?: Record<string, unknown>;
  moduleId: string;
  operationId: string;
  /**
   * Notify the platform that a request now waits on a human — wired to the
   * events runtime so inbox fan-out and tenant triggers can react. Called only
   * when a request is filed, never on the grant fast-path. Failures are the
   * emitter's to swallow: a lost notification must not turn into a lost gate.
   */
  onRequested?: (request: {
    approvalRequestId: string;
    context?: Record<string, unknown>;
    expiresAt: string;
    moduleId: string;
    operationId: string;
    reason: string;
  }) => Promise<void>;
  reason: string;
}): Promise<FiledApprovalRequest> {
  const { auth, moduleId, operationId } = params;
  // task_id rides on the stored request so approving it can resume the
  // blocked task (the tasks module subscribes to the decided event). A
  // policy-provided context keeps its own task_id if it set one.
  const context = {
    ...(auth.taskId ? { task_id: auth.taskId } : {}),
    ...params.context,
  };
  const request = await params.approvalService.request({
    actorId: auth.principalId,
    moduleId,
    operationId,
    reason: params.reason,
    tenantId: auth.tenantId,
    ...(Object.keys(context).length > 0 ? { context } : {}),
  });
  await params.onRequested?.({
    approvalRequestId: request.id,
    expiresAt: request.expiresAt,
    moduleId,
    operationId,
    reason: params.reason,
    ...(params.context ? { context: params.context } : {}),
  });
  const auditContext = params.component
    ? { component: params.component }
    : undefined;
  // Two events, deliberately: `policy.require_approval` is why the call
  // stopped, `approval.created` is what a human now owns. Reviews of a blocked
  // operation read the first; the approval queue's history reads the second.
  for (const type of ["policy.require_approval", "approval.created"] as const) {
    recordModuleAuditEvent(
      params.auditLog,
      moduleId,
      {
        actorId: auth.principalId,
        detail: { approvalRequestId: request.id },
        moduleId,
        operationId,
        tenantId: auth.tenantId,
        type,
      },
      auditContext
    );
  }
  return {
    approvalRequestId: request.id,
    expiresAt: request.expiresAt,
    reason: params.reason,
  };
}

/**
 * `onRequested` wired to the events runtime: one platform-wide
 * `approval.requested` core event, whatever module the gated operation belongs
 * to. Modules used to emit their own flavors (connections emitted
 * `connections.approval.requested` from its policy hook) which meant every
 * module invented notification fan-out again; tenant triggers and inbox can
 * now subscribe to the one name. Emit failures are logged and swallowed — a
 * lost notification must not turn into a lost gate.
 */
export function emitApprovalRequested(
  registry: Pick<PluginRegistry, "eventsRuntime">,
  auth: PrincipalContext
): NonNullable<Parameters<typeof fileApprovalRequest>[0]["onRequested"]> {
  return async (request) => {
    try {
      await registry.eventsRuntime?.api.core.emit(
        "approval.requested",
        {
          actor_id: auth.principalId,
          // Origin for whoever surfaces this: the agent that asked, the space
          // it asked in, the thread/task/routine it was working — everything
          // the notification row needs to say who, where and why.
          ...(auth.agentId ? { agent_id: auth.agentId } : {}),
          approval_request_id: request.approvalRequestId,
          context: request.context ?? null,
          expires_at: request.expiresAt,
          ...(auth.goalId ? { goal_id: auth.goalId } : {}),
          module_id: request.moduleId,
          operation_id: request.operationId,
          reason: request.reason,
          ...(auth.spaceId ? { space_id: auth.spaceId } : {}),
          ...(auth.taskId ? { task_id: auth.taskId } : {}),
          tenant_id: auth.tenantId,
          ...(auth.triggerId ? { trigger_id: auth.triggerId } : {}),
        },
        {
          actorId: auth.principalId,
          principalId: auth.principalId,
          sourceModuleId: "core",
          tenantId: auth.tenantId,
        }
      );
    } catch {
      // Notification is best-effort; the request row is already durable.
    }
  };
}

/** What every decide route reports after `approvalService.decide`. */
export interface ApprovalDecidedEvent {
  actorId: string | null;
  decision: string;
  moduleId: string;
  operationId: string;
  requestId: string;
  tenantId: string;
}

/**
 * The other half of the gate's lifecycle: one platform-wide
 * `approval.decided` core event after a request is decided, wherever it was
 * decided (tenant route, superadmin route, a chat card settling through the
 * tenant route). The notifications package resolves the request's record on
 * it. Emit failures are swallowed like the request side — the decision is
 * already durable.
 */
export function emitApprovalDecided(
  registry: Pick<PluginRegistry, "eventsRuntime">
): (event: ApprovalDecidedEvent) => Promise<void> {
  return async (event) => {
    try {
      await registry.eventsRuntime?.api.core.emit(
        "approval.decided",
        {
          actor_id: event.actorId,
          approval_request_id: event.requestId,
          decision: event.decision,
          module_id: event.moduleId,
          operation_id: event.operationId,
          tenant_id: event.tenantId,
        },
        {
          ...(event.actorId
            ? { actorId: event.actorId, principalId: event.actorId }
            : {}),
          sourceModuleId: "core",
          tenantId: event.tenantId,
        }
      );
    } catch {
      // Best-effort; the sweep closes the record on its next pass.
    }
  };
}
