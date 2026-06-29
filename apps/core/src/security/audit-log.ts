import { uuidv7 } from "uuidv7";

export interface SecurityAuditEvent {
  actorId?: string;
  detail?: Record<string, unknown>;
  id: string;
  moduleId?: string;
  operationId?: string;
  tenantId?: string;
  timestamp: string;
  type:
    | "policy.allow"
    | "policy.deny"
    | "policy.require_approval"
    | "approval.created"
    | "approval.decided"
    | "operation.executed"
    | "operation.rejected"
    | "auth.login_started"
    | "auth.login_completed"
    | "auth.token_exchanged"
    | "auth.token_revoked"
    | "auth.api_token_created"
    | "auth.session_revoked"
    | "auth.rate_limited"
    | (string & {}); // allow module-defined types e.g. projects.project.created
}

export function createSecurityAuditLog(maxEntries = 2000) {
  const events: SecurityAuditEvent[] = [];
  return {
    push(event: Omit<SecurityAuditEvent, "id" | "timestamp">) {
      events.push({
        id: uuidv7(),
        timestamp: new Date().toISOString(),
        ...event,
      });
      if (events.length > maxEntries) {
        events.splice(0, events.length - maxEntries);
      }
    },
    list(limit = 200): SecurityAuditEvent[] {
      return events.slice(Math.max(0, events.length - limit));
    },
  };
}
