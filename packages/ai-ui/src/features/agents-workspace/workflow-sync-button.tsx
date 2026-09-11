// "Sync workflows" for the workflow detail pages.
//
// A bundled workflow is a file in its module's source tree; the app only
// learns about an edit when the reconcile pass re-reads it, which otherwise
// happens at AI-app boot. The pass covers every module workflow of the
// tenant, so this is one button, not a per-workflow refresh.
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { RefreshCw } from "lucide-react";
import { useReconcileModuleWorkflowsMutation } from "../workflow-canvas/workflow-queries.js";

export function WorkflowSyncButton() {
  const { t } = useTranslation("ai-ui");
  const sync = useReconcileModuleWorkflowsMutation();
  const label = t("workflowsDetail.syncModules");

  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* In place, not a toast — ai-ui has no toaster, and a sync that
          silently did nothing is exactly what this button exists to rule out. */}
      {sync.isError ? (
        <span className="truncate text-destructive text-xs">
          {t("workflowsDetail.syncModulesFailed")}
        </span>
      ) : null}
      <Button
        disabled={sync.isPending}
        onClick={() => sync.mutate()}
        size="sm"
        title={t("workflowsDetail.syncModulesHint")}
        type="button"
        variant="outline"
      >
        <RefreshCw
          aria-hidden
          className={sync.isPending ? "size-3.5 animate-spin" : "size-3.5"}
        />
        {label}
      </Button>
    </div>
  );
}
