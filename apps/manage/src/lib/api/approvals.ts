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
 * Cross-tenant pending-approval queue. Uses the superadmin routes — the plain
 * `/api/security/approvals` surface is scoped to the caller's own tenant; these
 * return every tenant's requests and are gated by `requireSuperAdmin` in core.
 */
export function listPendingApprovals(signal?: AbortSignal) {
  return request<ApprovalRequest[]>("/api/superadmin/approvals", { signal });
}

export function decideApproval(id: string, decision: ApprovalDecision) {
  return request<ApprovalRequest>(
    `/api/superadmin/approvals/${encodeURIComponent(id)}/decision`,
    { method: "POST", body: { decision } }
  );
}
