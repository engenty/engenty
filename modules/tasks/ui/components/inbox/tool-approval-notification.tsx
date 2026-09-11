// The body the tasks module renders under a `tool_approval` notification:
// the run's gated operations with allow-once / allow-for-task / deny. The
// shell owns the list; this is what its records of that kind can DO.
import type { NotificationRendererProps } from "@engenty/notifications-ui";
import {
  ToolApprovalActions,
  ToolApprovalBatchActions,
} from "./tool-approval-actions.js";

/** Every gated op the announcing run is waiting on (>=1), and its task. */
function approvalContext(
  notification: NotificationRendererProps["notification"]
): { operationIds: string[]; taskId: string } | null {
  const taskId =
    notification.subject_type === "task"
      ? notification.subject_id
      : notification.metadata?.task_id;
  const operationId = notification.metadata?.operation_id;
  if (typeof taskId !== "string" || typeof operationId !== "string") {
    return null;
  }
  const rawIds = notification.metadata?.operation_ids;
  const operationIds = Array.isArray(rawIds)
    ? [
        ...new Set(
          rawIds.filter((id): id is string => typeof id === "string" && !!id)
        ),
      ]
    : [];
  return {
    operationIds: operationIds.length > 0 ? operationIds : [operationId],
    taskId,
  };
}

/** The per-operation label + risk the run reported, from `payload.approvals`. */
function approvalDetail(
  notification: NotificationRendererProps["notification"],
  operationId: string
): { risk_level?: string; title?: string } | null {
  const approvals = notification.payload?.approvals;
  if (!Array.isArray(approvals)) {
    return null;
  }
  const match = approvals.find(
    (entry): entry is { operation_id: string } & Record<string, unknown> =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { operation_id?: unknown }).operation_id === operationId
  );
  if (!match) {
    return null;
  }
  return {
    ...(typeof match.risk_level === "string"
      ? { risk_level: match.risk_level }
      : {}),
    ...(typeof match.title === "string" ? { title: match.title } : {}),
  };
}

export function ToolApprovalNotification({
  notification,
}: NotificationRendererProps) {
  const approval = approvalContext(notification);
  if (!approval) {
    return null;
  }
  return (
    <>
      <ToolApprovalBatchActions
        operationIds={approval.operationIds}
        taskId={approval.taskId}
      />
      {approval.operationIds.map((operationId) => {
        const detail = approvalDetail(notification, operationId);
        return (
          <ToolApprovalActions
            key={operationId}
            operationId={operationId}
            riskLevel={detail?.risk_level ?? null}
            taskId={approval.taskId}
            title={detail?.title ?? null}
          />
        );
      })}
    </>
  );
}
