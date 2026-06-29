import { uuidv7 } from "uuidv7";

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

interface ApprovalGrant {
  actorId: string;
  moduleId: string;
  operationId: string;
  scope: "once" | "session" | "policy";
  sessionId?: string;
}

export function createApprovalService(ttlMs = 5 * 60 * 1000) {
  const requests = new Map<string, ApprovalRequest>();
  const grants: ApprovalGrant[] = [];

  function expireIfNeeded(req: ApprovalRequest): ApprovalRequest {
    if (req.status !== "pending") {
      return req;
    }
    if (Date.parse(req.expiresAt) <= Date.now()) {
      req.status = "expired";
    }
    return req;
  }

  return {
    request(input: {
      actorId: string;
      tenantId: string;
      moduleId: string;
      operationId: string;
      reason: string;
      context?: Record<string, unknown>;
    }): ApprovalRequest {
      const now = Date.now();
      const req: ApprovalRequest = {
        id: uuidv7(),
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMs).toISOString(),
        status: "pending",
        actorId: input.actorId,
        tenantId: input.tenantId,
        moduleId: input.moduleId,
        operationId: input.operationId,
        reason: input.reason,
        context: input.context,
      };
      requests.set(req.id, req);
      return req;
    },
    listPending(): ApprovalRequest[] {
      return [...requests.values()]
        .map(expireIfNeeded)
        .filter((req) => req.status === "pending")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    get(id: string): ApprovalRequest | null {
      const req = requests.get(id);
      if (!req) {
        return null;
      }
      return expireIfNeeded(req);
    },
    decide(input: {
      requestId: string;
      decision: ApprovalDecision;
      decidedBy: string;
      sessionId?: string;
    }): ApprovalRequest | null {
      const req = requests.get(input.requestId);
      if (!req) {
        return null;
      }
      expireIfNeeded(req);
      if (req.status !== "pending") {
        return req;
      }
      req.decision = input.decision;
      req.decidedBy = input.decidedBy;
      req.decidedAt = new Date().toISOString();
      req.status = input.decision === "deny" ? "denied" : "approved";
      if (req.status === "approved") {
        const scope =
          input.decision === "allow_once"
            ? "once"
            : input.decision === "allow_session"
              ? "session"
              : "policy";
        grants.push({
          actorId: req.actorId,
          moduleId: req.moduleId,
          operationId: req.operationId,
          scope,
          sessionId: input.sessionId,
        });
      }
      return req;
    },
    consumeGrant(input: {
      actorId: string;
      moduleId: string;
      operationId: string;
      sessionId?: string;
    }): boolean {
      const idx = grants.findIndex((grant) => {
        if (grant.actorId !== input.actorId) {
          return false;
        }
        if (grant.moduleId !== input.moduleId) {
          return false;
        }
        if (grant.operationId !== input.operationId) {
          return false;
        }
        if (grant.scope === "session") {
          return !!grant.sessionId && grant.sessionId === input.sessionId;
        }
        return true;
      });
      if (idx < 0) {
        return false;
      }
      if (grants[idx].scope === "once") {
        grants.splice(idx, 1);
      }
      return true;
    },
  };
}
