import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalDecision, ApprovalRequestRow } from "./store.js";
import {
  consumeApprovalGrant,
  decideApprovalRequest,
  findPendingApprovalRequest,
  getApprovalRequest,
  insertApprovalGrant,
  insertApprovalRequest,
  listPendingApprovalRequests,
} from "./store.js";

export type { ApprovalDecision } from "./store.js";

/**
 * Approval requests and the grants they produce, backed by core tables (D2).
 *
 * Previously both lived in a per-process Map: a restart dropped every pending
 * request and every standing "allow" a human had given, and a second replica
 * could not see the first one's grants — so the same operation could be gated
 * twice or, worse, an approval could be silently lost between the human saying
 * yes and the run retrying. The store is now durable and shared; this module is
 * only the policy around it (TTL, decision → scope mapping).
 */

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

function toRequest(row: ApprovalRequestRow, now = Date.now()): ApprovalRequest {
  // A pending row past its TTL is reported as expired without a write: the
  // decide path re-checks `status = 'pending'` in SQL, so an aged-out row can
  // never be approved even though we did not sweep it here.
  const status =
    row.status === "pending" && Date.parse(row.expires_at) <= now
      ? "expired"
      : row.status;
  return {
    actorId: row.actor_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    moduleId: row.module_id,
    operationId: row.operation_id,
    reason: row.reason,
    status,
    tenantId: row.tenant_id,
    ...(row.context ? { context: row.context } : {}),
    ...(row.decided_at ? { decidedAt: row.decided_at } : {}),
    ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
    ...(row.decision ? { decision: row.decision } : {}),
  };
}

const DECISION_SCOPE = {
  allow_once: "once",
  allow_session: "session",
  allow_policy: "policy",
} as const;

/**
 * Backstop lifetimes for grants that are not meant to stand forever.
 *
 * The Map this replaced was garbage-collected by process death, which quietly
 * bounded every grant. A durable store has no such luck: an `allow once` whose
 * retry never came, or a session grant whose owner closed the tab instead of
 * logging out, would otherwise sit there indefinitely. `policy` grants get no
 * expiry — standing authorization is exactly what they mean.
 */
const GRANT_TTL_MS = {
  once: 60 * 60 * 1000,
  session: 24 * 60 * 60 * 1000,
} as const;

/**
 * How long a request waits for a human before it lapses. The old in-memory
 * Map used 5 minutes — tuned for a caller blocking on the answer. These rows
 * feed a durable queue a person may open tomorrow morning; a request that
 * silently died overnight looks like the system never asked.
 */
const DEFAULT_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createApprovalService(
  db: SupabaseClient,
  ttlMs = DEFAULT_REQUEST_TTL_MS
) {
  return {
    /**
     * File a request, or return the live pending one for the same
     * (actor, operation) — a blocked caller retrying must not stack a new
     * queue entry per attempt.
     */
    async request(input: {
      actorId: string;
      tenantId: string;
      moduleId: string;
      operationId: string;
      reason: string;
      context?: Record<string, unknown>;
    }): Promise<ApprovalRequest> {
      const existing = await findPendingApprovalRequest(db, {
        actorId: input.actorId,
        moduleId: input.moduleId,
        operationId: input.operationId,
        tenantId: input.tenantId,
      });
      if (existing) {
        return toRequest(existing);
      }
      const row = await insertApprovalRequest(db, {
        actorId: input.actorId,
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        moduleId: input.moduleId,
        operationId: input.operationId,
        reason: input.reason,
        tenantId: input.tenantId,
        ...(input.context ? { context: input.context } : {}),
      });
      return toRequest(row);
    },

    /** Pending requests for one tenant — the filter is applied in SQL. */
    async listPending(tenantId: string): Promise<ApprovalRequest[]> {
      const rows = await listPendingApprovalRequests(db, tenantId);
      return rows.map((row) => toRequest(row));
    },

    /** Every tenant's pending requests — the superadmin queue only. */
    async listPendingAllTenants(): Promise<ApprovalRequest[]> {
      const rows = await listPendingApprovalRequests(db, null);
      return rows.map((row) => toRequest(row));
    },

    async get(id: string): Promise<ApprovalRequest | null> {
      const row = await getApprovalRequest(db, id);
      return row ? toRequest(row) : null;
    },

    /**
     * Decide a request and, when approved, write the grant it implies. The
     * update is conditioned on the row still being pending, so a second
     * approver racing the same request gets the already-decided row back
     * instead of minting a duplicate grant.
     */
    async decide(input: {
      requestId: string;
      tenantId: string;
      decision: ApprovalDecision;
      decidedBy: string;
      sessionId?: string;
    }): Promise<ApprovalRequest | null> {
      const decided = await decideApprovalRequest(db, {
        decidedAt: new Date().toISOString(),
        decidedBy: input.decidedBy,
        decision: input.decision,
        id: input.requestId,
        tenantId: input.tenantId,
      });
      if (!decided) {
        // Either the request does not exist, or it was already decided/expired.
        const existing = await getApprovalRequest(db, input.requestId);
        return existing && existing.tenant_id === input.tenantId
          ? toRequest(existing)
          : null;
      }
      if (input.decision !== "deny") {
        const scope = DECISION_SCOPE[input.decision];
        const ttlMsForScope = scope === "policy" ? null : GRANT_TTL_MS[scope];
        await insertApprovalGrant(db, {
          actorId: decided.actor_id,
          expiresAt: ttlMsForScope
            ? new Date(Date.now() + ttlMsForScope).toISOString()
            : null,
          grantedBy: input.decidedBy,
          moduleId: decided.module_id,
          operationId: decided.operation_id,
          requestId: decided.id,
          scope,
          subjectId: scope === "session" ? (input.sessionId ?? null) : null,
          tenantId: decided.tenant_id,
        });
      }
      return toRequest(decided);
    },

    async consumeGrant(input: {
      actorId: string;
      tenantId: string;
      moduleId: string;
      operationId: string;
      sessionId?: string;
      /** Task/trigger/goal ids the caller is working under — the subjects
       * a subject-bound grant may match. */
      subjectIds?: string[];
    }): Promise<boolean> {
      return await consumeApprovalGrant(db, {
        actorId: input.actorId,
        moduleId: input.moduleId,
        operationId: input.operationId,
        sessionId: input.sessionId ?? null,
        tenantId: input.tenantId,
        ...(input.subjectIds ? { subjectIds: input.subjectIds } : {}),
      });
    },
  };
}
