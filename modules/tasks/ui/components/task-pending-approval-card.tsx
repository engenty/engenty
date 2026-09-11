// Pending tool-approval card on the task detail page. When a headless run
// paused this task waiting for a tool approval, the task itself records the
// operations it is waiting on. Surface them here with the same Allow-once /
// Allow-for-task / Deny actions as the inbox, so a human can unblock the task
// from the task itself.
//
// This reads the TASK, not the inbox notification that announces it: the
// notification is dismissible, and keying the only unblock UI off it meant
// dismissing without deciding stranded the task blocked forever. The
// notification is still cleaned up on resolve, as a courtesy.
import {
  type InboxNotificationDto,
  useInboxListQuery,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Card } from "@engenty/ui-core";
import { ShieldCheck } from "lucide-react";
import type { Task } from "../../src/schema/types.js";
import {
  ToolApprovalActions,
  ToolApprovalBatchActions,
} from "./inbox/tool-approval-actions.js";

export function TaskPendingApprovalCard({ task }: { task: Task }) {
  const { t } = useTranslation("tasks");
  const inboxQuery = useInboxListQuery({ status: "open" });

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
      <ToolApprovalBatchActions
        operationIds={pendingOperationIds}
        taskId={task.id}
      />
      <ul className="space-y-3">
        {pendingOperationIds.map((operationId) => {
          const detail = detailFor(operationId);
          return (
            <li key={operationId}>
              <ToolApprovalActions
                operationId={operationId}
                riskLevel={detail.riskLevel}
                taskId={task.id}
                title={detail.title}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
