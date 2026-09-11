// "Approved tools" section on the task sidebar — lists the operation ids this
// task may run without asking (persistent grants, plus one-shot grants marked
// "once"). The grants live in core.approval_grants (subject = task id), so
// revoking goes through the dedicated revoke route, not a task PATCH. Hidden
// when there are no grants.
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { ShieldCheck, X } from "lucide-react";
import { useRevokeApprovalGrantMutation } from "../tasks-queries.js";

export function TaskApprovedToolsSection({
  taskId,
  grants,
  onceGrants,
  disabled,
  showHeading = true,
}: {
  taskId: string;
  grants: string[];
  onceGrants: string[];
  disabled?: boolean;
  showHeading?: boolean;
}) {
  const { t } = useTranslation("tasks");
  const revokeMutation = useRevokeApprovalGrantMutation(taskId);

  if (grants.length === 0 && onceGrants.length === 0) {
    return null;
  }

  const remove = (operationId: string) => {
    revokeMutation.mutate(operationId);
  };

  return (
    <div className="space-y-1.5 px-1 pt-1">
      {showHeading ? (
        <h4 className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("detail.approvedTools")}
        </h4>
      ) : null}
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
              disabled={disabled || revokeMutation.isPending}
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
