import { request } from "./http";

export type ApprovalDecision =
  | "allow_once"
  | "allow_session"
  | "allow_policy"
  | "deny";

export interface ApprovalRequest {
  actorId: string;
  context?: Record<string, unknown>;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decision?: ApprovalDecision;
  expiresAt: string;
  id: string;
  moduleId: string;
  operationId: string;
  reason: string;
  status: "pending" | "approved" | "denied" | "expired";
  tenantId: string;
}

/**
 * The pending-approval queue is a process-global in-memory list in core, so
 * this returns requests across every tenant — exactly what the platform console
 * wants. Superadmin-gated at the app level.
 */
export function listPendingApprovals(signal?: AbortSignal) {
  return request<ApprovalRequest[]>("/api/security/approvals", { signal });
}

export function decideApproval(id: string, decision: ApprovalDecision) {
  return request<ApprovalRequest>(
    `/api/security/approvals/${encodeURIComponent(id)}/decision`,
    { method: "POST", body: { decision } }
  );
}
