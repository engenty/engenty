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

  // Best-effort: dismiss the announcement once its request is answered here, so
  // the inbox does not keep offering a decision that has already been made.
  const dismissMatchingNotifications = (operationId: string) => {
    for (const n of (inboxQuery.data?.notifications ??
      []) as InboxNotificationDto[]) {
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
      <div className="flex items-center gap-2 font-semibold text-sm">
        <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        {t("detail.pendingApprovalTitle")}
      </div>
      <ul className="space-y-3">
        {pendingOperationIds.map((operationId) => (
          <li className="space-y-1" key={operationId}>
            <p className="text-muted-foreground text-xs">
              {t("detail.pendingApprovalBody", { operation: operationId })}
            </p>
            <ToolApprovalActions
              onResolved={() => dismissMatchingNotifications(operationId)}
              operationId={operationId}
              taskId={task.id}
              triggerId={task.trigger_id ?? null}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
