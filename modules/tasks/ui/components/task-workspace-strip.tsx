import { isEngentyDeveloperModeUiEnabled } from "@engenty/environment";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import {
  ExternalLink,
  FolderOpen,
  HardDrive,
  Layers,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  taskWorkspaceKey,
  taskWorkspaceTenantRelativeDisplayPath,
} from "../../src/lib/task-workspace.js";
import type { Task } from "../../src/schema/types.js";
import { useTaskRunObserverContext } from "../context/task-run-observer-context.js";
import { buildTaskWorkspaceFilesHref } from "../lib/task-files-link.js";
import { TaskPropertyEmpty, TaskPropertyRow } from "./task-property-row.js";

function resolveWorkspaceFsMode(): "remote" | "local" {
  try {
    const raw = import.meta.env.VITE_ENGENTY_WORKSPACE_FS;
    if (typeof raw === "string" && raw.trim() === "local") {
      return "local";
    }
    if (typeof raw === "string" && raw.trim() === "file-storage") {
      return "remote";
    }
    return "remote";
  } catch {
    return "remote";
  }
}

interface TaskWorkspaceStripProps {
  task: Task;
}

export function TaskWorkspaceStrip({ task }: TaskWorkspaceStripProps) {
  const { t } = useTranslation("tasks");
  const { startWorkOnTask } = useTaskRunObserverContext();
  const { currentTenant } = useWorkspaceContext();
  const workspaceKey = taskWorkspaceKey(task.identifier);
  const storagePath =
    currentTenant?.id == null
      ? null
      : taskWorkspaceTenantRelativeDisplayPath(
          currentTenant.id,
          task.identifier
        );
  const filesHref =
    currentTenant?.id == null
      ? null
      : buildTaskWorkspaceFilesHref(currentTenant.id, task.identifier);

  const showDevBadge = isEngentyDeveloperModeUiEnabled();
  const workspaceFsMode = showDevBadge ? resolveWorkspaceFsMode() : null;

  const handleWorkOnTask = () => {
    void startWorkOnTask();
  };

  return (
    <section
      aria-label={t("detail.workspace.sectionAria")}
      className="flex min-w-[280px] flex-col gap-2"
    >
      <div className="px-1">
        <Button
          className="w-full justify-start gap-2"
          onClick={handleWorkOnTask}
          variant="ai"
        >
          <Sparkles className="size-3.5 shrink-0" />
          {t("detail.workspace.workOnTask")}
        </Button>
      </div>

      <TaskPropertyRow icon={Layers} label={t("detail.workspace.key")}>
        <code className="break-all font-mono text-sm">{workspaceKey}</code>
      </TaskPropertyRow>

      <TaskPropertyRow
        icon={FolderOpen}
        label={t("detail.workspace.storagePath")}
      >
        {storagePath ? (
          <code className="break-all font-mono text-sm">{storagePath}</code>
        ) : (
          <TaskPropertyEmpty>
            {t("detail.workspace.noTenant")}
          </TaskPropertyEmpty>
        )}
      </TaskPropertyRow>

      {workspaceFsMode ? (
        <TaskPropertyRow
          icon={HardDrive}
          label={t("detail.workspace.storageModeLabel")}
        >
          <code className="break-all font-mono text-sm">{workspaceFsMode}</code>
        </TaskPropertyRow>
      ) : null}

      {filesHref ? (
        <div className="flex flex-col gap-1 px-1">
          <Button
            asChild
            className="w-full justify-start gap-2"
            variant="outline"
          >
            <Link to={filesHref}>
              <ExternalLink className="size-3.5 shrink-0" />
              {t("detail.workspace.openInFiles")}
            </Link>
          </Button>
          <p className="text-muted-foreground text-xs">
            {t("detail.workspace.openInFilesHint")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
