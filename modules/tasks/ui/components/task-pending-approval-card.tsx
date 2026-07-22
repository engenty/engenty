// Pending tool-approval card on the task detail page. When a headless run
// paused this task waiting for a tool approval, the durable request lives as an
// open `tool_approval` inbox notification tagged with this task id. Surface it
// here with the same Allow-once / task / routine / Deny actions as the inbox, so
// a human can unblock the task from the task itself.
import {
  type InboxNotificationDto,
  useInboxListQuery,
  useMarkInboxNotificationMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Card } from "@engenty/ui-core";
import { ShieldCheck } from "lucide-react";
import { ToolApprovalActions } from "./inbox/inbox-list.js";

export function TaskPendingApprovalCard({ taskId }: { taskId: string }) {
  const { t } = useTranslation("tasks");
  const inboxQuery = useInboxListQuery({ status: "open" });
  const markMutation = useMarkInboxNotificationMutation();

  const pending = (inboxQuery.data?.notifications ?? []).filter(
    (n: InboxNotificationDto) =>
      n.kind === "tool_approval" && n.metadata?.task_id === taskId
  );
  if (pending.length === 0) {
    return null;
  }

  return (
    <Card className="space-y-3 border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        {t("detail.pendingApprovalTitle")}
      </div>
      <ul className="space-y-3">
        {pending.map((n: InboxNotificationDto) => {
          const operationId =
            typeof n.metadata?.operation_id === "string"
              ? n.metadata.operation_id
              : "";
          const triggerId =
            typeof n.metadata?.trigger_id === "string"
              ? n.metadata.trigger_id
              : null;
          if (!operationId) {
            return null;
          }
          return (
            <li className="space-y-1" key={n.id}>
              <p className="text-muted-foreground text-xs">
                {t("detail.pendingApprovalBody", { operation: operationId })}
              </p>
              <ToolApprovalActions
                onResolved={() =>
                  markMutation.mutate({ action: "dismiss", id: n.id })
                }
                operationId={operationId}
                taskId={taskId}
                triggerId={triggerId}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
