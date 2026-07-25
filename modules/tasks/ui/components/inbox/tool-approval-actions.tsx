// Inline Allow-once / task / routine / Deny buttons for a pending approval.
// On resolve, the notification is dismissed (the run has already ended; the
// task re-dispatches on approve). Shared by the inbox and the task card.
import { useMarkInboxNotificationMutation } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useResolveToolApprovalMutation } from "../../tasks-queries.js";

export function ToolApprovalActions({
  operationId,
  taskId,
  triggerId,
  onResolved,
}: {
  operationId: string;
  taskId: string;
  triggerId: string | null;
  onResolved?: () => void;
}) {
  const { t } = useTranslation("tasks");
  const resolveMutation = useResolveToolApprovalMutation();
  const markMutation = useMarkInboxNotificationMutation();
  const pending = resolveMutation.isPending;

  const resolve = (
    decision: "approve" | "deny",
    scope?: "once" | "task" | "routine"
  ) => {
    resolveMutation.mutate(
      { body: { decision, operation_id: operationId, scope }, taskId },
      { onSuccess: () => onResolved?.() }
    );
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">
        {operationId}
      </code>
      <Button
        disabled={pending}
        onClick={() => resolve("approve", "once")}
        size="sm"
        variant="outline"
      >
        {t("inbox.approveOnce")}
      </Button>
      <Button
        disabled={pending}
        onClick={() => resolve("approve", "task")}
        size="sm"
        variant="outline"
      >
        {t("inbox.approveForTask")}
      </Button>
      {triggerId ? (
        <Button
          disabled={pending}
          onClick={() => resolve("approve", "routine")}
          size="sm"
          variant="outline"
        >
          {t("inbox.approveForRoutine")}
        </Button>
      ) : null}
      <Button
        className="text-destructive hover:text-destructive"
        disabled={pending || markMutation.isPending}
        onClick={() => resolve("deny")}
        size="sm"
        variant="ghost"
      >
        {t("inbox.denyApproval")}
      </Button>
    </div>
  );
}
