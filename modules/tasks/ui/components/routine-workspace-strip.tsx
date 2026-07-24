import type { RoutineDto } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { FolderOpen } from "lucide-react";
import { routineWorkspaceTenantRelativeDisplayPath } from "../../src/lib/routine-workspace.js";
import { TaskPropertyEmpty, TaskPropertyRow } from "./task-property-row.js";

export function RoutineWorkspaceStrip({ routine }: { routine: RoutineDto }) {
  const { t } = useTranslation("tasks");
  const { currentTenant } = useWorkspaceContext();
  const storagePath =
    currentTenant?.id == null
      ? null
      : routineWorkspaceTenantRelativeDisplayPath(currentTenant.id, routine.id);

  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        {t("routines.detail.workspace")}
      </h4>
      <TaskPropertyRow
        icon={FolderOpen}
        label={t("routines.detail.workspacePath")}
      >
        {storagePath ? (
          <code className="break-all font-mono text-sm">{storagePath}</code>
        ) : (
          <TaskPropertyEmpty>
            {t("routines.detail.workspaceEmpty")}
          </TaskPropertyEmpty>
        )}
      </TaskPropertyRow>
      <p className="text-muted-foreground text-xs leading-normal">
        {t("routines.detail.workspaceHint")}
      </p>
    </div>
  );
}
