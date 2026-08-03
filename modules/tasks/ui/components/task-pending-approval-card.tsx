// Pending tool-approval card on the task detail page. When a headless run
// paused this task waiting for a tool approval, the task itself records the
// operations it is waiting on. Surface them here with the same Allow-once /
// task / routine / Deny actions as the inbox, so a human can unblock the task
// from the task itself.
//
// This reads the TASK, not the inbox notification that announces it: the
// notification is dismissible, and keying the only unblock UI off it meant
// dismissing without deciding stranded the task blocked forever. The
// notification is still cleaned up on resolve, as a courtesy.
import {
  type InboxNotificationDto,
  useInboxListQuery,
  useMarkInboxNotificationMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Card } from "@engenty/ui-core";
import { ShieldCheck } from "lucide-react";
import type { Task } from "../../src/schema/types.js";
import { ToolApprovalActions } from "./inbox/tool-approval-actions.js";

export function TaskPendingApprovalCard({ task }: { task: Task }) {
  const { t } = useTranslation("tasks");
  const inboxQuery = useInboxListQuery({ status: "open" });
  const markMutation = useMarkInboxNotificationMutation();

  const pendingOperationIds = task.pending_approval_operation_ids ?? [];
  if (pendingOperationIds.length === 0) {
    return null;
  }

  // The task row stores only operation ids. The announcing notification carries
  // the readable context the run reported — the one-line summary of what it
  // wants to do, and per-operation labels/risk — so borrow it when it is still
  // around. Dismissing the notification only costs the extra context, never the
  // ability to decide.
  const notifications = (inboxQuery.data?.notifications ??
    []) as InboxNotificationDto[];
  const announcement = notifications.find(
    (n) => n.kind === "tool_approval" && n.metadata?.task_id === task.id
  );
  const summary =
    typeof announcement?.payload?.approval_summary === "string"
      ? announcement.payload.approval_summary
      : null;
  const notes =
    typeof announcement?.payload?.result_text === "string"
      ? announcement.payload.result_text.replace(/\s+/g, " ").trim()
      : null;
  const approvals = Array.isArray(announcement?.payload?.approvals)
    ? (announcement.payload.approvals as Record<string, unknown>[])
    : [];
  const detailFor = (operationId: string) => {
    const match = approvals.find((a) => a.operation_id === operationId);
    return {
      riskLevel:
        typeof match?.risk_level === "string" ? match.risk_level : null,
      title: typeof match?.title === "string" ? match.title : null,
    };
  };

  // Best-effort: dismiss the announcement once its request is answered here, so
  // the inbox does not keep offering a decision that has already been made.
  const dismissMatchingNotifications = (operationId: string) => {
    for (const n of notifications) {
      if (
        n.kind === "tool_approval" &&
        n.metadata?.task_id === task.id &&
        n.metadata?.operation_id === operationId
      ) {
        markMutation.mutate({ action: "dismiss", id: n.id });
      }
    }
  };

  return (
    <Card className="space-y-3 border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex min-w-0 items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-sm leading-tight">
            {t("detail.pendingApprovalTitle")}
          </p>
          <p className="text-muted-foreground text-xs leading-snug">
            {summary ?? t("detail.pendingApprovalFallback")}
          </p>
          {notes ? (
            <p className="line-clamp-3 text-muted-foreground/80 text-xs leading-snug">
              {notes}
            </p>
          ) : null}
        </div>
      </div>
      <ul className="space-y-3">
        {pendingOperationIds.map((operationId) => {
          const detail = detailFor(operationId);
          return (
            <li key={operationId}>
              <ToolApprovalActions
                onResolved={() => dismissMatchingNotifications(operationId)}
                operationId={operationId}
                riskLevel={detail.riskLevel}
                taskId={task.id}
                title={detail.title}
                triggerId={task.trigger_id ?? null}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
