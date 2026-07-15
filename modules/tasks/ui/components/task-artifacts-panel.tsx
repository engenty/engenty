import {
  activateArtifact,
  ENGENTY_COPILOT_HOST_KEY,
  useArtifactsListQuery,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Shapes } from "lucide-react";
import { TaskPropertyEmpty, TaskPropertyRow } from "./task-property-row.js";

/**
 * Doc-sidebar section listing artifacts stored (promoted) to this task.
 * Clicking a row opens it in the page's artifact pane — the pane on the task
 * detail route merges the copilot thread's artifacts with the task's.
 */
export function TaskArtifactsPanel({ taskId }: { taskId: string }) {
  const { t } = useTranslation("tasks");
  const listQuery = useArtifactsListQuery("task", taskId);
  const artifacts = listQuery.data ?? [];

  return (
    <section aria-label={t("detail.workspace.artifacts")} className="space-y-2">
      <h3 className="px-1 font-medium text-sm">
        {t("detail.workspace.artifacts")}
      </h3>
      {listQuery.isLoading ? (
        <p className="px-1 text-muted-foreground text-sm">…</p>
      ) : artifacts.length === 0 ? (
        // No label — the section heading right above already names it.
        <TaskPropertyRow icon={Shapes}>
          <TaskPropertyEmpty>
            {t("detail.workspace.artifactsEmpty")}
          </TaskPropertyEmpty>
        </TaskPropertyRow>
      ) : (
        <div className="space-y-2">
          {artifacts.map((artifact) => (
            <Button
              className="h-auto w-full justify-start gap-2 px-3 py-2"
              key={artifact.id}
              onClick={() =>
                activateArtifact(ENGENTY_COPILOT_HOST_KEY, artifact.id)
              }
              variant="outline"
            >
              <Shapes className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate text-left text-sm">
                {artifact.title}
              </span>
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
