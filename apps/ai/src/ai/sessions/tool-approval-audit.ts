// Phase 3.2c — audit trail for tool-approval decisions.
//
// Records every approve/deny the user makes on a gated operation. Today this emits
// a structured server log (durable + greppable). The authoritative audit store is
// core's `core.audit_events` table (apps/core/src/security/audit-log.ts), reached
// over HTTP — wiring that call is the one remaining cross-process seam (see
// approvals-plan-3.2c.md). The shape below mirrors core's SecurityAuditEvent
// (`type: "approval.decided"`) so the HTTP forwarder is a drop-in later.
export interface ToolApprovalAuditEvent {
  decision: "approve_once" | "approve_always" | "deny";
  operationId: string;
  /** Bulk pre-approval: every operation the ONE decision covered. */
  operationIds?: string[];
  tenantId: string;
  threadId: string;
  userId: string;
}

export function auditToolApprovalDecision(event: ToolApprovalAuditEvent): void {
  // Structured single-line record — matches core's "approval.decided" event type.
  console.info(
    "[tool-approval] approval.decided",
    JSON.stringify({
      type: "approval.decided",
      decision: event.decision,
      operation_id: event.operationId,
      ...(event.operationIds?.length
        ? { operation_ids: event.operationIds }
        : {}),
      tenant_id: event.tenantId,
      user_id: event.userId,
      thread_id: event.threadId,
    })
  );
  // TODO(approvals-audit-seam): forward to core `POST` audit-log so the decision
  // lands in `core.audit_events` alongside policy.* / operation.* events.
}
