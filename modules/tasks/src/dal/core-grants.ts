import {
  insertApprovalGrant,
  listGrantOperationIdsForSubjects,
  listGrantsForSubject,
  revokeApprovalGrant,
  revokeApprovalGrantsForSubject,
} from "@engenty/approvals-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoreGrantsWriter } from "../api/task-approval-service.js";

/**
 * Writes a task/routine tool approval into core.approval_grants (D2 phase 2c)
 * — since the task-row grant columns were dropped, the ONLY grant store.
 *
 * The core row is what CORE-side gates spend: the connections profile policy
 * (and any future escalation gate) consumes it via the run's forwarded
 * x-engenty-task-id, so approving from the task UI unblocks the retry at core
 * too — not only at the AI pre-gate. Actor and module are NULL on purpose:
 * the human approved "operation X for this task's work" before the retry's
 * principal existed, and with no module in hand (operation ids are globally
 * unique, so nothing is widened).
 */

/** Backstop for once-grants: consumed by the next run, which a human may only
 * re-dispatch days later — but not meant to outlive the week. Mirrors the 7d
 * request TTL, not the 1h interactive once-TTL. */
const ONCE_GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createCoreGrantsWriter(
  supabase: SupabaseClient,
  tenantId: string
): CoreGrantsWriter {
  return {
    async grant(input) {
      await insertApprovalGrant(supabase, {
        actorId: null,
        expiresAt:
          input.scope === "once"
            ? new Date(Date.now() + ONCE_GRANT_TTL_MS).toISOString()
            : null,
        grantedBy: input.grantedBy ?? null,
        moduleId: null,
        operationId: input.operationId,
        scope: input.scope,
        subjectId: input.subjectId,
        tenantId,
      });
    },

    async listBySubject(input) {
      const rows = await listGrantsForSubject(supabase, {
        subjectId: input.subjectId,
        tenantId,
      });
      const once = new Set<string>();
      const standing = new Set<string>();
      for (const row of rows) {
        (row.scope === "once" ? once : standing).add(row.operation_id);
      }
      return { once: [...once], standing: [...standing] };
    },

    async listOperationIds(input) {
      return await listGrantOperationIdsForSubjects(supabase, {
        subjectIds: input.subjectIds,
        tenantId,
      });
    },

    async revoke(input) {
      await revokeApprovalGrant(supabase, {
        operationId: input.operationId,
        subjectId: input.subjectId,
        tenantId,
      });
    },

    async revokeOnce(input) {
      await revokeApprovalGrantsForSubject(supabase, {
        scope: "once",
        subjectId: input.subjectId,
        tenantId,
      });
    },
  };
}
