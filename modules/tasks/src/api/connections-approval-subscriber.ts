// Resume a blocked task when its connections approval is decided.
//
// The connections module gates autonomous connector writes: the blocked run
// ends, the task flips to `blocked`, and a request waits in the approval
// queue. Deciding it emits `connections.approval.decided` (subscriber pattern
// — no import between the modules). Approval already minted the core grant
// the retried run will spend; what is left is the tasks side of the resume:
// record the one-shot pre-gate grant and re-dispatch, exactly what a human
// approving from the task itself would have caused. Without this, "approve"
// in the connections queue closed the request and the task stayed blocked
// until someone happened to re-run it by hand.
import type {
  PluginEventPayload,
  PluginEventsApi,
  QueueServiceLike,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTasksRepoSupabase } from "../dal/supabase.js";
import { resolveTaskToolApproval } from "./task-approval-service.js";

const logger = createLogger({ name: "tasks-connections-approvals" });

/**
 * What a decided event asks this module to do: resume (task, operation) or
 * nothing. A denial leaves the task blocked on purpose — the human can still
 * change their mind from the task. Requests not linked to a task have nothing
 * to resume.
 */
export function connectionsResumeTarget(
  payload: PluginEventPayload,
  context: { tenantId?: string }
): { operationId: string; taskId: string; tenantId: string } | null {
  const taskId = typeof payload.task_id === "string" ? payload.task_id : null;
  const operationId =
    typeof payload.operation_id === "string" ? payload.operation_id : null;
  const tenantId = context.tenantId ?? null;
  if (payload.approved !== true || !(taskId && operationId && tenantId)) {
    return null;
  }
  return { operationId, taskId, tenantId };
}

export function subscribeConnectionsApprovalResume(params: {
  events: PluginEventsApi;
  queue: QueueServiceLike | null;
  supabase: SupabaseClient;
}): void {
  params.events.modules.on(
    "connections.approval.decided",
    async (payload: PluginEventPayload, context) => {
      const target = connectionsResumeTarget(payload, context);
      if (!target) {
        return;
      }
      const { operationId, taskId, tenantId } = target;
      try {
        // Cross-scope lookup: the event does not carry the task's scope, the
        // repo requires one. Tenant-pinned by the event's own tenant id.
        const { data, error } = await params.supabase
          .schema("module_tasks")
          .from("tasks")
          .select("id, scope_id")
          .eq("id", taskId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (error || !data) {
          return;
        }
        const repo = createTasksRepoSupabase(
          params.supabase,
          tenantId,
          (data as { scope_id: string }).scope_id
        );
        await resolveTaskToolApproval(
          { queue: params.queue, tasksRepo: repo, tenantId },
          // "once", matching the one-shot core grant the decide minted — the
          // task is unblocked for this retry, not standing-approved.
          { decision: "approve", operationId, scope: "once", taskId }
        );
      } catch (error) {
        logger.warn("connections approval resume failed", {
          message: error instanceof Error ? error.message : String(error),
          taskId,
        });
      }
    }
  );
}
