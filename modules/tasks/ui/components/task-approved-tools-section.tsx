// "Approved tools" section on the task sidebar — lists the operation ids this
// task may run without asking (persistent grants, plus one-shot grants marked
// "once"). Persistent grants can be revoked; the replace-set PATCH mirrors the
// blocked-by-task-ids editing pattern. Hidden when there are no grants.
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { ShieldCheck, X } from "lucide-react";
import { useUpdateTaskMutation } from "../tasks-queries.js";

export function TaskApprovedToolsSection({
  taskId,
  grants,
  onceGrants,
  disabled,
}: {
  taskId: string;
  grants: string[];
  onceGrants: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation("tasks");
  const updateMutation = useUpdateTaskMutation(taskId);

  if (grants.length === 0 && onceGrants.length === 0) {
    return null;
  }

  const remove = (operationId: string) => {
    updateMutation.mutate({
      approval_grants: grants.filter((g) => g !== operationId),
    });
  };

  return (
    <div className="space-y-1.5 px-1 pt-1">
      <h4 className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("detail.approvedTools")}
      </h4>
      <ul className="flex flex-wrap gap-1.5">
        {grants.map((op) => (
          <li
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]"
            key={`persist-${op}`}
          >
            <code>{op}</code>
            <Button
              aria-label={t("detail.removeApprovedTool")}
              className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive"
              disabled={disabled || updateMutation.isPending}
              onClick={() => remove(op)}
              size="icon"
              variant="ghost"
            >
              <X className="h-3 w-3" />
            </Button>
          </li>
        ))}
        {onceGrants.map((op) => (
          <li
            className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
            key={`once-${op}`}
          >
            <code>{op}</code>
            <span className="uppercase tracking-wide opacity-70">
              {t("detail.approvedOnce")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
