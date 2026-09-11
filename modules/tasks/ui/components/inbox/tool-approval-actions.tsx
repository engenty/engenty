// Inline Allow-once / Allow-for-task / Deny buttons for a pending approval.
// On resolve, the notification is dismissed (the run has already ended; the
// task re-dispatches on approve). Shared by the inbox and the task card.
//
// Layout: the operation label owns its own line and the buttons own theirs.
// Keeping the label inline with the buttons made the row wrap raggedly in the
// narrow inbox column — a long operation id would push "Deny" onto a line of
// its own, and the id itself could overflow the card.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { useResolveToolApprovalMutation } from "../../tasks-queries.js";

/**
 * "Allow all" for a task waiting on SEVERAL gated ops at once. Approves every
 * pending op in one request with once-scope (the batch counterpart of "Allow
 * once"); the per-op rows stay available for granular scope/deny decisions.
 * Only rendered when more than one op is pending — the server holds the
 * re-dispatch until the pending set is empty, so batch-approving is the
 * one-click way to actually resume the run.
 */
export function ToolApprovalBatchActions({
  operationIds,
  taskId,
  onResolved,
}: {
  operationIds: string[];
  taskId: string;
  onResolved?: () => void;
}) {
  const { t } = useTranslation("tasks");
  const resolveMutation = useResolveToolApprovalMutation();
  if (operationIds.length < 2) {
    return null;
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <Button
        disabled={resolveMutation.isPending}
        onClick={() =>
          resolveMutation.mutate(
            {
              body: {
                decision: "approve",
                operation_ids: operationIds,
                scope: "once",
              },
              taskId,
            },
            { onSuccess: () => onResolved?.() }
          )
        }
        size="sm"
        variant="default"
      >
        {t("inbox.approveAllOnce")}
      </Button>
      <span className="text-muted-foreground text-xs">
        {t("inbox.approveAllHint", { count: operationIds.length })}
      </span>
    </div>
  );
}

/** Risk levels carried on a pending approval, worst first. */
const RISK_CLASS: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "border-border bg-muted text-muted-foreground",
};

export function ToolApprovalActions({
  operationId,
  taskId,
  title,
  riskLevel,
  onResolved,
}: {
  operationId: string;
  taskId: string;
  /** Human label for the gated operation, when the run reported one. */
  title?: string | null;
  riskLevel?: string | null;
  onResolved?: () => void;
}) {
  const { t } = useTranslation("tasks");
  const resolveMutation = useResolveToolApprovalMutation();
  const pending = resolveMutation.isPending;

  const resolve = (decision: "approve" | "deny", scope?: "once" | "task") => {
    resolveMutation.mutate(
      { body: { decision, operation_id: operationId, scope }, taskId },
      { onSuccess: () => onResolved?.() }
    );
  };

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {title ? (
          <span className="min-w-0 break-words font-medium text-foreground text-xs">
            {title}
          </span>
        ) : null}
        <code className="min-w-0 max-w-full break-all rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">
          {operationId}
        </code>
        {riskLevel ? (
          <span
            className={cn(
              "shrink-0 rounded border px-1 py-0.5 text-[10px] uppercase tracking-wide",
              RISK_CLASS[riskLevel] ?? RISK_CLASS.low
            )}
          >
            {t(`inbox.risk.${riskLevel}`, { defaultValue: riskLevel })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
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
        <Button
          className="text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => resolve("deny")}
          size="sm"
          variant="ghost"
        >
          {t("inbox.denyApproval")}
        </Button>
      </div>
    </div>
  );
}
